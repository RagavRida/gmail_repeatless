/**
 * Newsletter digest route
 */
import { Router } from 'express';
import { requireAuth } from '../auth/session.js';
import { getDigest, processNewsletters } from '../services/newsletterDedup.js';

const router = Router();

/**
 * GET /api/newsletters/digest
 * Returns deduplicated newsletter digest
 */
router.get('/digest', requireAuth, async (req, res, next) => {
  try {
    const days = parseInt(req.query.days) || 4;

    // Process any new newsletters first
    await processNewsletters(req.accountId);

    // Get digest
    const items = await getDigest(req.accountId, days);
    res.json({ items });
  } catch (error) {
    next(error);
  }
});

export default router;
