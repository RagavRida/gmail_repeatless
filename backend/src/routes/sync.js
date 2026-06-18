/**
 * Sync routes: trigger and monitor Gmail sync operations
 */
import { Router } from 'express';
import { requireAuth } from '../auth/session.js';
import { fullSync, incrementalSync } from '../gmail/sync.js';
import { batchSummarize } from '../services/summarization.js';
import { batchCategorize } from '../services/categorization.js';
import { aiEmbed } from '../ai/router.js';
import { getSupabase } from '../db/client.js';
import { logger } from '../middleware/logger.js';

const router = Router();

/**
 * POST /api/sync/start
 * Triggers a full or incremental sync. Runs AI processing after sync.
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

        logger.info(`Sync completed: ${JSON.stringify(result)}`);

        // Post-sync AI processing
        logger.info('Running post-sync AI processing...');
        await batchCategorize(accountId);
        await batchSummarize(accountId);
        await generateEmbeddings(accountId);

        logger.info('Post-sync AI processing completed');
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

/**
 * Generate embeddings for messages that don't have them yet.
 * Processes in batches with throttling to respect Gemini embedding API limits.
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

        // Throttle: 1s between embedding calls (Gemini embedding has separate quota)
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

