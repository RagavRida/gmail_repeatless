/**
 * Thread and message routes.
 * Serves email data to the frontend in the shape expected by the React components.
 */
import { Router } from 'express';
import { requireAuth } from '../auth/session.js';
import { getSupabase } from '../db/client.js';
import { CATEGORY_DISPLAY_MAP, CATEGORY_DB_MAP } from '../config/index.js';
import { summarizeThread } from '../services/summarization.js';
import { logger } from '../middleware/logger.js';

const router = Router();

/**
 * GET /api/threads
 * Returns threads list with pagination and filtering.
 * Maps DB categories to frontend display names.
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = getSupabase();
    const { category, page = 1, pageSize = 20, q } = req.query;
    const offset = (parseInt(page) - 1) * parseInt(pageSize);

    let query = db.from('threads')
      .select('*', { count: 'exact' })
      .eq('account_id', req.accountId)
      .order('last_message_at', { ascending: false })
      .range(offset, offset + parseInt(pageSize) - 1);

    // Filter by category (map frontend name to DB name)
    if (category && category !== 'All') {
      const dbCategory = CATEGORY_DB_MAP[category] || category.toLowerCase();
      query = query.eq('category', dbCategory);
    }

    const { data: threads, count, error } = await query;
    if (error) throw error;

    // For each thread, fetch messages to build the frontend shape
    const enriched = await Promise.all((threads || []).map(async (thread) => {
      const { data: messages } = await db.from('messages')
        .select('id, from_address, internal_date, body_text, body_html, snippet, subject, ai_summary, is_from_user')
        .eq('thread_id', thread.id)
        .order('internal_date', { ascending: true });

      // Search filter
      if (q) {
        const searchLower = q.toLowerCase();
        const matchesSearch = (thread.subject || '').toLowerCase().includes(searchLower) ||
          (thread.snippet || '').toLowerCase().includes(searchLower) ||
          messages?.some(m => (m.from_address || '').toLowerCase().includes(searchLower));
        if (!matchesSearch) return null;
      }

      return mapThreadToFrontend(thread, messages || []);
    }));

    const filtered = enriched.filter(Boolean);

    res.json({
      threads: filtered,
      total: count || filtered.length,
      page: parseInt(page),
      pageSize: parseInt(pageSize),
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/threads/:threadId
 * Returns a single thread with full message data
 */
router.get('/:threadId', requireAuth, async (req, res, next) => {
  try {
    const db = getSupabase();
    const { threadId } = req.params;

    const { data: thread } = await db.from('threads')
      .select('*')
      .eq('id', threadId)
      .eq('account_id', req.accountId)
      .single();

    if (!thread) {
      return res.status(404).json({ error: 'Thread not found' });
    }

    const { data: messages } = await db.from('messages')
      .select('*')
      .eq('thread_id', threadId)
      .order('internal_date', { ascending: true });

    // Generate AI summary on-the-fly if missing
    let threadSummary = thread.ai_summary;
    if (!threadSummary && messages && messages.length > 0) {
      try {
        threadSummary = await summarizeThread(threadId);
      } catch (err) {
        logger.error(`On-the-fly summary failed for ${threadId}: ${err.message}`);
        threadSummary = null;
      }
    }

    res.json(mapThreadToFrontend({ ...thread, ai_summary: threadSummary }, messages || []));
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/threads/:threadId/summarize
 * Generates or regenerates thread summary
 */
router.post('/:threadId/summarize', requireAuth, async (req, res, next) => {
  try {
    const summary = await summarizeThread(req.params.threadId);
    res.json({ threadSummary: summary });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/messages/:messageId
 * Returns a single message
 */
router.get('/messages/:messageId', requireAuth, async (req, res, next) => {
  try {
    const db = getSupabase();
    const { data: msg } = await db.from('messages')
      .select('*')
      .eq('id', req.params.messageId)
      .eq('account_id', req.accountId)
      .single();

    if (!msg) {
      return res.status(404).json({ error: 'Message not found' });
    }

    res.json(mapMessageToFrontend(msg));
  } catch (error) {
    next(error);
  }
});

// ================================================================
// Data mapping: DB shape → Frontend shape
// ================================================================

function mapThreadToFrontend(thread, messages) {
  const firstMsg = messages[0];
  const lastMsg = messages[messages.length - 1];
  const senderAddress = firstMsg?.from_address || '';

  return {
    id: thread.id,
    sender: extractSenderName(senderAddress),
    senderEmail: extractEmail(senderAddress),
    subject: thread.subject || '(no subject)',
    snippet: thread.snippet || '',
    time: formatDateDisplay(thread.last_message_at),
    category: CATEGORY_DISPLAY_MAP[thread.category] || 'Uncategorized',
    aiSummary: firstMsg?.ai_summary || thread.ai_summary || null,
    threadSummary: thread.ai_summary || null,
    read: !thread.is_unread,
    thread: messages.map(mapMessageToFrontend),
  };
}

function mapMessageToFrontend(msg) {
  return {
    id: msg.id,
    sender: msg.is_from_user ? 'You' : extractSenderName(msg.from_address),
    senderEmail: extractEmail(msg.from_address),
    time: formatDateTimeDisplay(msg.internal_date),
    body: sanitizeBodyText(msg.body_text || msg.snippet || ''),
    bodyHtml: msg.body_html || null,
  };
}

/**
 * Clean body text of any residual HTML/CSS/JS that may have leaked
 * from emails stored before the improved HTML-to-text converter.
 */
function sanitizeBodyText(text) {
  if (!text) return '';

  let clean = text;

  // Remove any <style>...</style> blocks
  clean = clean.replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '');
  // Remove any <script>...</script> blocks
  clean = clean.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '');
  // Remove any <head>...</head> blocks
  clean = clean.replace(/<head[^>]*>[\s\S]*?<\/head>/gi, '');
  // Remove HTML comments
  clean = clean.replace(/<!--[\s\S]*?-->/g, '');

  // Check if there's still significant HTML (more than a few tags)
  const tagCount = (clean.match(/<[^>]{2,}>/g) || []).length;
  if (tagCount > 3) {
    // Heavy HTML — do full conversion
    clean = clean.replace(/<\/(p|div|h[1-6]|li|tr|br|hr|blockquote|pre|table)[^>]*>/gi, '\n');
    clean = clean.replace(/<(br|hr)\s*\/?>/gi, '\n');
    clean = clean.replace(/<li[^>]*>/gi, '• ');
    clean = clean.replace(/<a[^>]*href="([^"]*)"[^>]*>(.*?)<\/a>/gi, '$2');
    clean = clean.replace(/<[^>]*>/g, '');
  }

  // Decode entities
  clean = clean.replace(/&nbsp;/gi, ' ');
  clean = clean.replace(/&amp;/gi, '&');
  clean = clean.replace(/&lt;/gi, '<');
  clean = clean.replace(/&gt;/gi, '>');
  clean = clean.replace(/&quot;/gi, '"');
  clean = clean.replace(/&#39;/gi, "'");
  clean = clean.replace(/&rsquo;/gi, "'");
  clean = clean.replace(/&lsquo;/gi, "'");
  clean = clean.replace(/&rdquo;/gi, '"');
  clean = clean.replace(/&ldquo;/gi, '"');
  clean = clean.replace(/&mdash;/gi, '—');
  clean = clean.replace(/&ndash;/gi, '–');
  clean = clean.replace(/&#\d+;/g, '');

  // Remove CSS-like content (e.g. .class { ... } blocks that leaked)
  clean = clean.replace(/[.#][\w-]+\s*\{[^}]*\}/g, '');
  // Remove @media queries
  clean = clean.replace(/@media[^{]*\{[\s\S]*?\}\s*\}/gi, '');

  // Normalize whitespace
  clean = clean.replace(/[ \t]+/g, ' ');
  clean = clean.replace(/\n{3,}/g, '\n\n');
  clean = clean.replace(/^\s+|\s+$/gm, '');

  return clean.trim();
}

function extractSenderName(fromAddress) {
  if (!fromAddress) return 'Unknown';
  const match = fromAddress.match(/^"?(.+?)"?\s*</);
  return match ? match[1].trim() : fromAddress.split('@')[0];
}

function extractEmail(fromAddress) {
  if (!fromAddress) return '';
  const match = fromAddress.match(/<(.+?)>/);
  return match ? match[1] : fromAddress;
}

function formatDateDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', { month: 'short', day: 'numeric', year: 'numeric' });
}

function formatDateTimeDisplay(dateStr) {
  if (!dateStr) return '';
  const d = new Date(dateStr);
  return d.toLocaleDateString('en-US', {
    month: 'short', day: 'numeric', year: 'numeric',
    hour: 'numeric', minute: '2-digit',
  });
}

export default router;
