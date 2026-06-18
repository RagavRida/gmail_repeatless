/**
 * Auth routes: Google OAuth2 flow + session management
 */
import { Router } from 'express';
import { getAuthUrl, handleCallback } from '../auth/oauth.js';
import { logger } from '../middleware/logger.js';

const router = Router();

/**
 * GET /api/auth/google/url
 * Returns the Google consent screen URL
 */
router.get('/google/url', (req, res) => {
  const url = getAuthUrl();
  res.json({ url });
});

/**
 * GET /api/auth/google/callback
 * Handles the OAuth2 callback, stores tokens, creates session
 */
router.get('/google/callback', async (req, res, next) => {
  try {
    const { code } = req.query;
    if (!code) {
      return res.status(400).json({ error: 'Missing authorization code' });
    }

    const account = await handleCallback(code);

    // Set session
    req.session.accountId = account.id;
    req.session.accountEmail = account.google_email;

    logger.info(`User authenticated: ${account.google_email}`);

    // Redirect to frontend (Vercel in production, / in development)
    const frontendUrl = process.env.FRONTEND_URL || '/';
    res.redirect(frontendUrl);
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/auth/session
 * Returns current session info
 */
router.get('/session', (req, res) => {
  if (req.session?.accountId) {
    return res.json({
      authenticated: true,
      email: req.session.accountEmail,
      accountId: req.session.accountId,
    });
  }
  res.json({ authenticated: false });
});

/**
 * POST /api/auth/logout
 * Destroys the session
 */
router.post('/logout', (req, res) => {
  req.session.destroy(() => {
    res.json({ ok: true });
  });
});

export default router;
