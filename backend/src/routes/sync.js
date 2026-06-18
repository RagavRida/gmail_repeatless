/**
 * Sync routes: trigger and monitor Gmail sync operations.
 * 
 * Priority order after sync:
 * 1. NEW emails → categorize immediately → embed immediately
 * 2. Remaining old uncategorized/unembedded → continue in background
 */
import { Router } from 'express';
import { requireAuth } from '../auth/session.js';
import { fullSync, incrementalSync } from '../gmail/sync.js';
import { batchSummarize } from '../services/summarization.js';
import { categorizeMessage } from '../services/categorization.js';
import { aiEmbed } from '../ai/router.js';
import { getSupabase } from '../db/client.js';
import { logger } from '../middleware/logger.js';

const router = Router();

/**
 * POST /api/sync/start
 * Triggers a full or incremental sync. Runs AI processing after sync.
 * Priority: new emails get categorized + embedded FIRST, then old emails.
 */
router.post('/start', requireAuth, async (req, res, next) => {
  try {
    const { type = 'incremental' } = req.body;
    const accountId = req.accountId;

    logger.info(`Starting ${type} sync for account ${accountId}`);
    res.json({ status: 'started', type });

    // Run sync in background (don't block response)
    (async () => {
      try {
        let result;
        if (type === 'full') {
          result = await fullSync(accountId);
        } else {
          result = await incrementalSync(accountId);
        }

        logger.info(`Sync completed: ${JSON.stringify({ ...result, newMessageIds: result.newMessageIds?.length || 0 })}`);

        const allNewIds = result.newMessageIds || [];

        if (allNewIds.length > 0) {
          // ═══════════════════════════════════════════════════
          // PRIORITY 1: Process NEW emails immediately
          // For large syncs (full sync), cap at 30 most recent
          // ═══════════════════════════════════════════════════
          const PRIORITY_CAP = 30;
          const priorityIds = allNewIds.slice(-PRIORITY_CAP); // Last N = most recent
          logger.info(`[PostSync] Priority processing ${priorityIds.length}/${allNewIds.length} newest emails...`);

          // 1a. Categorize priority emails immediately
          let categorized = 0;
          for (const msgId of priorityIds) {
            try {
              await categorizeMessage(msgId);
              categorized++;
            } catch (err) {
              logger.warn(`[PostSync] Failed to categorize ${msgId}: ${err.message}`);
            }
          }
          logger.info(`[PostSync] ✅ Categorized ${categorized}/${priorityIds.length} priority emails`);

          // 1b. Embed priority emails immediately
          await embedSpecificMessages(accountId, priorityIds);
          logger.info(`[PostSync] ✅ Embedded ${priorityIds.length} priority emails`);
        }

        // ═══════════════════════════════════════════════════
        // PRIORITY 2: Continue ALL remaining in background
        // ═══════════════════════════════════════════════════
        logger.info('[PostSync] Launching background tasks for remaining emails...');

        // 2a. Categorize ALL uncategorized messages (includes the ones skipped above)
        const { batchCategorize } = await import('../services/categorization.js');
        batchCategorize(accountId)
          .then(n => { if (n > 0) logger.info(`[PostSync] Background categorized ${n} remaining messages`); })
          .catch(err => logger.error(`[PostSync] Background categorization failed: ${err.message}`));

        // 2b. Embed ALL un-embedded messages
        generateEmbeddings(accountId)
          .then(() => logger.info(`[PostSync] Background embedding complete`))
          .catch(err => logger.error(`[PostSync] Background embedding failed: ${err.message}`));

        // 2c. Summarize
        batchSummarize(accountId)
          .catch(err => logger.error(`[PostSync] Summarization failed: ${err.message}`));

        logger.info('[PostSync] All background tasks launched');
      } catch (err) {
        logger.error(`Background sync failed: ${err.message}`);
      }
    })();
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/sync/status
 * Returns the latest sync job status
 */
router.get('/status', requireAuth, async (req, res, next) => {
  try {
    const db = getSupabase();
    const { data: jobs } = await db.from('sync_jobs')
      .select('*')
      .eq('account_id', req.accountId)
      .order('started_at', { ascending: false })
      .limit(1);

    const latest = jobs?.[0] || null;
    res.json({
      status: latest?.status || 'none',
      type: latest?.type,
      stats: latest?.stats,
      startedAt: latest?.started_at,
      completedAt: latest?.completed_at,
      error: latest?.error,
    });
  } catch (error) {
    next(error);
  }
});

// ================================================================
// EMBEDDING FUNCTIONS
// ================================================================

/**
 * Embed specific messages by ID — used for priority embedding of new emails.
 * No throttling needed since these are small batches (< 50 usually).
 */
async function embedSpecificMessages(accountId, messageIds) {
  if (!messageIds || messageIds.length === 0) return;

  const db = getSupabase();
  let embedded = 0;

  for (const msgId of messageIds) {
    try {
      const { data: msg } = await db.from('messages')
        .select('id, subject, body_text, snippet, embedding')
        .eq('id', msgId)
        .single();

      // Skip if already embedded or no text
      if (!msg || msg.embedding) continue;

      const text = `${msg.subject || ''} ${msg.body_text || msg.snippet || ''}`.trim();
      if (!text) continue;

      const embedding = await aiEmbed(text.substring(0, 2000));
      await db.from('messages').update({ embedding }).eq('id', msgId);
      embedded++;

      // Light throttle: 300ms between new email embeddings (fast for small batches)
      await new Promise(r => setTimeout(r, 300));
    } catch (err) {
      logger.warn(`[EmbedNew] Failed to embed ${msgId}: ${err.message}`);
    }
  }

  logger.info(`[EmbedNew] Embedded ${embedded}/${messageIds.length} new messages`);
}

/**
 * Generate embeddings for ALL remaining messages without them.
 * Heavier throttling since this processes hundreds/thousands.
 */
async function generateEmbeddings(accountId) {
  const db = getSupabase();
  let totalProcessed = 0;
  let consecutiveErrors = 0;

  while (true) {
    const { data: messages } = await db.from('messages')
      .select('id, subject, body_text, snippet')
      .eq('account_id', accountId)
      .is('embedding', null)
      .not('body_text', 'is', null)
      .limit(100);

    if (!messages || messages.length === 0) break;

    for (const msg of messages) {
      try {
        const text = `${msg.subject || ''} ${msg.body_text || msg.snippet || ''}`.trim();
        if (!text) continue;

        const embedding = await aiEmbed(text.substring(0, 2000));
        await db.from('messages').update({ embedding }).eq('id', msg.id);
        totalProcessed++;
        consecutiveErrors = 0;

        // Throttle: 1s between embedding calls (background, not urgent)
        await new Promise((r) => setTimeout(r, 1000));
      } catch (err) {
        consecutiveErrors++;
        logger.error(`Failed to embed message ${msg.id}: ${err.message}`);

        if (consecutiveErrors >= 5) {
          logger.warn(`[Embeddings] ${consecutiveErrors} consecutive errors, pausing 60s...`);
          await new Promise((r) => setTimeout(r, 60000));
          consecutiveErrors = 0;
        } else {
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }

    if (totalProcessed > 0 && totalProcessed % 50 === 0) {
      logger.info(`[Embeddings] Generated ${totalProcessed} embeddings so far for account ${accountId}`);
    }
  }

  if (totalProcessed > 0) {
    logger.info(`[Embeddings] Completed: ${totalProcessed} embeddings for account ${accountId}`);
  }
}

/**
 * POST /api/sync/embeddings
 * Manually trigger embedding generation for all messages without embeddings.
 */
router.post('/embeddings', requireAuth, async (req, res) => {
  const accountId = req.accountId;
  const db = getSupabase();

  const { count } = await db.from('messages')
    .select('id', { count: 'exact', head: true })
    .eq('account_id', accountId)
    .is('embedding', null)
    .not('body_text', 'is', null);

  res.json({ status: 'started', pendingEmbeddings: count });

  // Run in background
  generateEmbeddings(accountId).catch(err =>
    logger.error(`Manual embedding generation failed: ${err.message}`)
  );
});

export default router;
