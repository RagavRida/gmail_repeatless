/**
 * Session middleware and requireAuth guard.
 * Uses express-session with in-memory store (suitable for single-user assessment).
 * After OAuth callback, session.accountId is set.
 */
import session from 'express-session';
import { config } from '../config/index.js';
import { getSupabase } from '../db/client.js';

export function setupSession(app) {
  app.use(
    session({
      secret: config.sessionSecret,
      resave: false,
      saveUninitialized: false,
      name: 'gmail_session',
      cookie: {
        httpOnly: true,
        secure: config.nodeEnv === 'production',
        sameSite: config.nodeEnv === 'production' ? 'none' : 'lax', // 'none' required for cross-origin (Vercel→Render)
        maxAge: 7 * 24 * 60 * 60 * 1000, // 7 days
      },
    })
  );
}

/**
 * Middleware: requires an authenticated session.
 * Attaches req.accountId and req.accountEmail for downstream handlers.
 */
export async function requireAuth(req, res, next) {
  if (!req.session || !req.session.accountId) {
    return res.status(401).json({ error: 'Not authenticated. Please connect your Gmail account.' });
  }

  req.accountId = req.session.accountId;
  req.accountEmail = req.session.accountEmail;
  next();
}
