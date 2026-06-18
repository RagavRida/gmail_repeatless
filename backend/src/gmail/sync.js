/**
 * Gmail sync orchestration: full sync and incremental sync.
 *
 * Full sync: paginate messages.list, batch-fetch with bounded concurrency (p-limit ~5),
 * parse headers, persist to Supabase, track progress in sync_jobs.
 *
 * Incremental sync: use history.list from stored historyId to apply deltas only.
 */
import pLimit from 'p-limit';
import { getGmailClient } from './client.js';
import { withBackoff } from './backoff.js';
import { getSupabase } from '../db/client.js';
import { logger } from '../middleware/logger.js';

const CONCURRENCY = 5;
const PAGE_SIZE = 100;

// ================================================================
// FULL SYNC
// ================================================================

/**
 * Perform a full sync of the user's inbox.
 * Paginates messages.list, fetches each message body with bounded concurrency,
 * and persists to DB.
 */
export async function fullSync(accountId) {
  const db = getSupabase();
  const { gmail, account } = await getGmailClient(accountId);
  const limit = pLimit(CONCURRENCY);

  // Create sync job record
  const { data: job } = await db
    .from('sync_jobs')
    .insert({ account_id: accountId, type: 'full', status: 'running', stats: { fetched: 0, processed: 0, errors: 0 } })
    .select()
    .single();

  const jobId = job.id;
  let totalFetched = 0;
  let totalProcessed = 0;
  let totalErrors = 0;
  let latestHistoryId = null;
  const newMessageIds = []; // Track ALL synced message IDs for priority processing

  try {
    let pageToken = null;

    do {
      // Fetch page of message IDs
      const listResult = await withBackoff(
        () => gmail.users.messages.list({
          userId: 'me',
          maxResults: PAGE_SIZE,
          ...(pageToken && { pageToken }),
        }),
        'messages.list'
      );

      const messages = listResult.data.messages || [];
      pageToken = listResult.data.nextPageToken || null;
      totalFetched += messages.length;

      // Batch fetch full message bodies with bounded concurrency
      const results = await Promise.allSettled(
        messages.map((msg) =>
          limit(async () => {
            await fetchAndPersistMessage(gmail, db, accountId, msg.id);
            newMessageIds.push(msg.id);
          })
        )
      );

      for (const result of results) {
        if (result.status === 'fulfilled') {
          totalProcessed++;
        } else {
          totalErrors++;
          logger.error('Message fetch/persist failed:', result.reason?.message);
        }
      }

      // Update job stats periodically
      await db.from('sync_jobs').update({
        stats: { fetched: totalFetched, processed: totalProcessed, errors: totalErrors },
      }).eq('id', jobId);

      // Build thread records progressively so UI updates during sync
      await buildThreadRecords(db, accountId);

      logger.info(`Full sync progress: ${totalProcessed}/${totalFetched} messages (${totalErrors} errors)`);

    } while (pageToken);

    // Get historyId from profile for future incremental syncs
    try {
      const profile = await withBackoff(
        () => gmail.users.getProfile({ userId: 'me' }),
        'users.getProfile'
      );
      latestHistoryId = profile.data.historyId;
    } catch (e) {
      logger.warn(`Could not get historyId from profile: ${e.message}`);
    }

    // Update account with historyId for incremental sync
    const accountUpdates = {
      last_full_sync_at: new Date().toISOString(),
    };
    if (latestHistoryId) {
      accountUpdates.gmail_history_id = latestHistoryId;
    }
    await db.from('accounts').update(accountUpdates).eq('id', accountId);

    // Finalize sync job
    await db.from('sync_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      stats: { fetched: totalFetched, processed: totalProcessed, errors: totalErrors },
    }).eq('id', jobId);

    // Build threads from messages
    await buildThreadRecords(db, accountId);

    logger.info(`Full sync completed: ${totalProcessed}/${totalFetched} messages (${newMessageIds.length} IDs tracked)`);

    // Return newMessageIds — the sync route handles priority categorization
    return { jobId, fetched: totalFetched, processed: totalProcessed, errors: totalErrors, newMessageIds };

  } catch (error) {
    await db.from('sync_jobs').update({
      status: 'failed',
      completed_at: new Date().toISOString(),
      error: error.message,
      stats: { fetched: totalFetched, processed: totalProcessed, errors: totalErrors },
    }).eq('id', jobId);
    throw error;
  }
}

// ================================================================
// INCREMENTAL SYNC
// ================================================================

/**
 * Perform incremental sync using history.list from the stored historyId.
 * Applies only messagesAdded / labelsAdded / labelsRemoved / messagesDeleted deltas.
 */
export async function incrementalSync(accountId) {
  const db = getSupabase();
  const { gmail, account } = await getGmailClient(accountId);
  const limit = pLimit(CONCURRENCY);

  if (!account.gmail_history_id) {
    logger.warn('No historyId found, falling back to full sync');
    return fullSync(accountId);
  }

  const { data: job } = await db
    .from('sync_jobs')
    .insert({ account_id: accountId, type: 'incremental', status: 'running', stats: {} })
    .select()
    .single();

  const jobId = job.id;
  let added = 0, deleted = 0, modified = 0;
  let latestHistoryId = account.gmail_history_id;
  const newMessageIds = []; // Track IDs of newly synced messages

  try {
    let pageToken = null;

    do {
      const historyResult = await withBackoff(
        () => gmail.users.history.list({
          userId: 'me',
          startHistoryId: account.gmail_history_id,
          ...(pageToken && { pageToken }),
        }),
        'history.list'
      );

      const histories = historyResult.data.history || [];
      pageToken = historyResult.data.nextPageToken || null;

      if (historyResult.data.historyId) {
        latestHistoryId = historyResult.data.historyId;
      }

      for (const record of histories) {
        // Messages added
        if (record.messagesAdded) {
          const tasks = record.messagesAdded.map((m) =>
            limit(async () => {
              await fetchAndPersistMessage(gmail, db, accountId, m.message.id);
              newMessageIds.push(m.message.id);
            })
          );
          await Promise.allSettled(tasks);
          added += record.messagesAdded.length;
        }

        // Messages deleted
        if (record.messagesDeleted) {
          for (const m of record.messagesDeleted) {
            await db.from('messages').delete().eq('id', m.message.id);
            deleted++;
          }
        }

        // Labels added/removed — update label arrays
        if (record.labelsAdded) {
          for (const m of record.labelsAdded) {
            await updateMessageLabels(db, m.message.id, m.labelIds, 'add');
            modified++;
          }
        }
        if (record.labelsRemoved) {
          for (const m of record.labelsRemoved) {
            await updateMessageLabels(db, m.message.id, m.labelIds, 'remove');
            modified++;
          }
        }
      }

    } while (pageToken);

    // Update historyId
    await db.from('accounts').update({
      gmail_history_id: latestHistoryId,
      last_incremental_sync_at: new Date().toISOString(),
    }).eq('id', accountId);

    // Rebuild thread records for affected threads
    await buildThreadRecords(db, accountId);

    await db.from('sync_jobs').update({
      status: 'completed',
      completed_at: new Date().toISOString(),
      stats: { added, deleted, modified },
    }).eq('id', jobId);

    logger.info(`Incremental sync completed: +${added} -${deleted} ~${modified} (${newMessageIds.length} new IDs tracked)`);

    return { jobId, added, deleted, modified, newMessageIds };

  } catch (error) {
    // If historyId is too old, Gmail returns 404 — fall back to full sync
    if (error?.response?.status === 404) {
      logger.warn('HistoryId expired, falling back to full sync');
      await db.from('sync_jobs').update({
        status: 'failed', error: 'historyId expired, running full sync', completed_at: new Date().toISOString(),
      }).eq('id', jobId);
      return fullSync(accountId);
    }

    await db.from('sync_jobs').update({
      status: 'failed', completed_at: new Date().toISOString(), error: error.message,
    }).eq('id', jobId);
    throw error;
  }
}

// ================================================================
// HELPERS
// ================================================================

/**
 * Fetch a single message's full data from Gmail and persist to DB.
 */
async function fetchAndPersistMessage(gmail, db, accountId, messageId) {
  const msgResult = await withBackoff(
    () => gmail.users.messages.get({
      userId: 'me',
      id: messageId,
      format: 'full',
    }),
    'messages.get'
  );

  const msg = msgResult.data;
  const headers = parseHeaders(msg.payload?.headers || []);
  const body = extractBody(msg.payload);
  const userEmail = await getUserEmail(db, accountId);

  const record = {
    id: msg.id,
    thread_id: msg.threadId,
    account_id: accountId,
    internal_date: msg.internalDate ? new Date(parseInt(msg.internalDate)).toISOString() : null,
    from_address: headers.from || null,
    to_addresses: parseAddressList(headers.to),
    cc_addresses: parseAddressList(headers.cc),
    subject: headers.subject || null,
    snippet: msg.snippet || null,
    body_text: body.text || null,
    body_html: body.html || null,
    message_id_header: headers['message-id'] || null,
    in_reply_to_header: headers['in-reply-to'] || null,
    references_header: headers.references ? headers.references.split(/\s+/) : null,
    gmail_label_ids: msg.labelIds || [],
    is_from_user: isFromUser(headers.from, userEmail),
  };

  // Create thread stub first to satisfy FK constraint (messages.thread_id → threads.id)
  await db.from('threads').upsert({
    id: msg.threadId,
    account_id: accountId,
    subject: headers.subject || null,
    snippet: msg.snippet || null,
    last_message_at: record.internal_date,
    updated_at: new Date().toISOString(),
  }, { onConflict: 'id', ignoreDuplicates: false });

  const { error } = await db.from('messages').upsert(record, { onConflict: 'id' });
  if (error) {
    logger.error(`Failed to persist message ${msg.id}: ${error.message}`);
  }

  return { historyId: msg.historyId };
}

/**
 * Build/update thread records from messages in the database.
 */
async function buildThreadRecords(db, accountId) {
  // Get distinct thread IDs with their message data
  const { data: threadData, error } = await db
    .from('messages')
    .select('thread_id, subject, snippet, from_address, internal_date, gmail_label_ids')
    .eq('account_id', accountId)
    .order('internal_date', { ascending: false });

  if (error || !threadData) {
    logger.error(`buildThreadRecords query error for ${accountId}:`, error?.message || 'no data');
    return;
  }
  logger.info(`buildThreadRecords: found ${threadData.length} messages for account ${accountId}`);

  // Group by thread_id
  const threadMap = new Map();
  for (const msg of threadData) {
    if (!threadMap.has(msg.thread_id)) {
      threadMap.set(msg.thread_id, []);
    }
    threadMap.get(msg.thread_id).push(msg);
  }

  for (const [threadId, messages] of threadMap) {
    const latest = messages[0]; // Already sorted desc
    const oldest = messages[messages.length - 1];
    const participants = [...new Set(messages.map((m) => m.from_address).filter(Boolean))];
    const hasUnread = messages.some((m) =>
      m.gmail_label_ids?.includes('UNREAD')
    );

    await db.from('threads').upsert({
      id: threadId,
      account_id: accountId,
      subject: oldest.subject || latest.subject,
      snippet: latest.snippet,
      participants: participants.map((p) => ({ address: p })),
      message_count: messages.length,
      last_message_at: latest.internal_date,
      is_unread: hasUnread,
      gmail_label_ids: latest.gmail_label_ids,
      updated_at: new Date().toISOString(),
    }, { onConflict: 'id' });
  }

  logger.info(`Built/updated ${threadMap.size} thread records`);
}

async function updateMessageLabels(db, messageId, labelIds, action) {
  const { data: existing } = await db.from('messages').select('gmail_label_ids').eq('id', messageId).single();
  if (!existing) return;

  let labels = existing.gmail_label_ids || [];
  if (action === 'add') {
    labels = [...new Set([...labels, ...labelIds])];
  } else {
    labels = labels.filter((l) => !labelIds.includes(l));
  }
  await db.from('messages').update({ gmail_label_ids: labels }).eq('id', messageId);
}

function parseHeaders(headers) {
  const result = {};
  for (const h of headers) {
    result[h.name.toLowerCase()] = h.value;
  }
  return result;
}

function parseAddressList(str) {
  if (!str) return [];
  return str.split(',').map((s) => s.trim()).filter(Boolean);
}

function extractBody(payload) {
  const result = { text: null, html: null };
  if (!payload) return result;

  function walk(part) {
    if (part.mimeType === 'text/plain' && part.body?.data) {
      result.text = Buffer.from(part.body.data, 'base64').toString('utf8');
    }
    if (part.mimeType === 'text/html' && part.body?.data) {
      result.html = Buffer.from(part.body.data, 'base64').toString('utf8');
    }
    if (part.parts) {
      part.parts.forEach(walk);
    }
  }

  walk(payload);

  // Convert HTML to clean text if we only got HTML
  if (!result.text && result.html) {
    result.text = htmlToCleanText(result.html);
  }

  return result;
}

/**
 * Convert HTML to clean, readable text.
 * Strips scripts, styles, tags, and decodes entities.
 */
function htmlToCleanText(html) {
  let text = html;

  // Remove script and style blocks entirely (including content)
  text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  text = text.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  text = text.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');

  // Remove HTML comments
  text = text.replace(/<!--[\s\S]*?-->/g, '');

  // Convert block-level elements to newlines
  text = text.replace(/<\/(p|div|h[1-6]|li|tr|br|hr|blockquote|pre|table)[^>]*>/gi, '\n');
  text = text.replace(/<(br|hr)\s*\/?>/gi, '\n');
  text = text.replace(/<li[^>]*>/gi, '• ');

  // Convert links to text with URL
  text = text.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2 ($1)');

  // Strip all remaining HTML tags
  text = text.replace(/<[^>]*>/g, '');

  // Decode common HTML entities
  text = text.replace(/&nbsp;/gi, ' ');
  text = text.replace(/&amp;/gi, '&');
  text = text.replace(/&lt;/gi, '<');
  text = text.replace(/&gt;/gi, '>');
  text = text.replace(/&quot;/gi, '"');
  text = text.replace(/&#39;/gi, "'");
  text = text.replace(/&rsquo;/gi, "'");
  text = text.replace(/&lsquo;/gi, "'");
  text = text.replace(/&rdquo;/gi, '"');
  text = text.replace(/&ldquo;/gi, '"');
  text = text.replace(/&mdash;/gi, '—');
  text = text.replace(/&ndash;/gi, '–');
  text = text.replace(/&bull;/gi, '•');
  text = text.replace(/&#\d+;/g, ''); // Remove remaining numeric entities

  // Normalize whitespace
  text = text.replace(/[ \t]+/g, ' ');           // Collapse horizontal whitespace
  text = text.replace(/\n{3,}/g, '\n\n');         // Max 2 consecutive newlines
  text = text.replace(/^\s+|\s+$/gm, '');         // Trim each line

  return text.trim();
}

function isFromUser(fromHeader, userEmail) {
  if (!fromHeader || !userEmail) return false;
  return fromHeader.toLowerCase().includes(userEmail.toLowerCase());
}

async function getUserEmail(db, accountId) {
  const { data } = await db.from('accounts').select('google_email').eq('id', accountId).single();
  return data?.google_email;
}
