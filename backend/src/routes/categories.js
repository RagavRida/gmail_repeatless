/**
 * Categories route
 */
import { Router } from 'express';
import { requireAuth } from '../auth/session.js';
import { getSupabase } from '../db/client.js';
import { CATEGORY_DISPLAY_MAP } from '../config/index.js';
import { batchCategorize } from '../services/categorization.js';
import { logger } from '../middleware/logger.js';

const router = Router();

/**
 * GET /api/categories
 * Returns category stats: name, total count, unread count
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = getSupabase();
    const { data: threads } = await db.from('threads')
      .select('category, is_unread')
      .eq('account_id', req.accountId);

    // Aggregate stats
    const stats = {};
    for (const [dbName, displayName] of Object.entries(CATEGORY_DISPLAY_MAP)) {
      stats[displayName] = { name: displayName, total: 0, unread: 0 };
    }

    for (const thread of (threads || [])) {
      const displayName = CATEGORY_DISPLAY_MAP[thread.category] || 'Uncategorized';
      if (!stats[displayName]) {
        stats[displayName] = { name: displayName, total: 0, unread: 0 };
      }
      stats[displayName].total++;
      if (thread.is_unread) stats[displayName].unread++;
    }

    res.json({ categories: Object.values(stats) });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/categories/run
 * Manually trigger batch categorization for all uncategorized messages.
 */
router.post('/run', requireAuth, async (req, res, next) => {
  try {
    const accountId = req.accountId;
    res.json({ status: 'started', message: 'Categorization running in background' });

    // Run in background
    batchCategorize(accountId)
      .then((n) => logger.info(`Manual categorization completed: ${n} messages`))
      .catch((err) => logger.error(`Manual categorization failed: ${err.message}`));
  } catch (error) {
    next(error);
  }
});

export default router;
