/**
 * Gmail Repeatless — Express API Server
 *
 * Serves the Vite-built React frontend as static files and provides
 * the REST API for all backend functionality.
 *
 * Architecture: Single deployable service (Express serves both static
 * frontend and API) to avoid CORS complexity for a project this size.
 */
import express from 'express';
import cors from 'cors';
import helmet from 'helmet';
import path from 'path';
import fs from 'fs';
import { fileURLToPath } from 'url';
import { config, validateConfig } from './src/config/index.js';
import { setupSession } from './src/auth/session.js';
import { errorHandler } from './src/middleware/errorHandler.js';
import { rateLimiter } from './src/middleware/rateLimiter.js';
import { logger } from './src/middleware/logger.js';

// Routes
import authRoutes from './src/routes/auth.js';
import syncRoutes from './src/routes/sync.js';
import threadRoutes from './src/routes/threads.js';
import composeRoutes from './src/routes/compose.js';
import chatRoutes from './src/routes/chat.js';
import categoryRoutes from './src/routes/categories.js';
import newsletterRoutes from './src/routes/newsletters.js';

// Validate required env vars
validateConfig();

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const app = express();

// ================================================================
// MIDDLEWARE
// ================================================================

// Trust proxy in production (Railway, Render, etc. use reverse proxies)
if (config.nodeEnv === 'production') {
  app.set('trust proxy', 1);
}

// Security headers (relaxed CSP for development)
app.use(helmet({
  contentSecurityPolicy: config.nodeEnv === 'production' ? undefined : false,
}));

// CORS — allow Vercel frontend + local dev
const allowedOrigins = [
  config.frontendUrl,
  'http://localhost:3000',
  'http://localhost:5173',
].filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow requests with no origin (server-to-server, curl, etc.)
    if (!origin || allowedOrigins.includes(origin)) return cb(null, true);
    cb(null, false);
  },
  credentials: true,
}));

// Trust proxy (Render sits behind a reverse proxy — needed for secure cookies)
app.set('trust proxy', 1);

// Body parsing
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// Session
setupSession(app);

// Request logging
app.use((req, res, next) => {
  if (req.path.startsWith('/api')) {
    logger.info(`${req.method} ${req.path}`);
  }
  next();
});

// Rate limiting for API routes
app.use('/api', rateLimiter({ windowMs: 60000, maxRequests: 120 }));

// ================================================================
// API ROUTES
// ================================================================

app.use('/api/auth', authRoutes);
app.use('/api/sync', syncRoutes);
app.use('/api/threads', threadRoutes);
app.use('/api/compose', composeRoutes);
app.use('/api/chat/conversations', chatRoutes);
app.use('/api/categories', categoryRoutes);
app.use('/api/newsletters', newsletterRoutes);

// Thread reply and send are in the compose router but need top-level mounts
// because their paths don't share a common prefix with /api/compose
import { requireAuth } from './src/auth/session.js';
import { composeReply } from './src/services/compose.js';
import { getGmailClient } from './src/gmail/client.js';
import { buildNewMessage, buildReplyMessage } from './src/gmail/mime.js';
import { withBackoff } from './src/gmail/backoff.js';
import { getSupabase } from './src/db/client.js';

// POST /api/threads/:threadId/reply
app.post('/api/threads/:threadId/reply', requireAuth, async (req, res, next) => {
  try {
    const { prompt, tone } = req.body;
    if (!prompt) return res.status(400).json({ error: 'Prompt is required' });
    const result = await composeReply(req.accountId, req.params.threadId, { prompt, tone });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

// POST /api/send
app.post('/api/send', requireAuth, async (req, res, next) => {
  try {
    const { to, subject, body, threadId, draftId } = req.body;
    if (!to || !body) {
      return res.status(400).json({ error: 'Recipient and body are required' });
    }

    const { gmail, account } = await getGmailClient(req.accountId);
    const db = getSupabase();
    let raw;
    let gmailThreadId;

    if (threadId) {
      const { data: messages } = await db.from('messages')
        .select('message_id_header, references_header, subject')
        .eq('thread_id', threadId)
        .order('internal_date', { ascending: false })
        .limit(1);

      const lastMsg = messages?.[0];
      raw = buildReplyMessage({
        to,
        subject: subject || lastMsg?.subject || '',
        body,
        from: account.google_email,
        messageIdHeader: lastMsg?.message_id_header,
        referencesHeaders: lastMsg?.references_header || [],
      });
      gmailThreadId = threadId;
    } else {
      raw = buildNewMessage({ to, subject, body, from: account.google_email });
    }

    const sendResult = await withBackoff(
      () => gmail.users.messages.send({
        userId: 'me',
        requestBody: {
          raw,
          ...(gmailThreadId && { threadId: gmailThreadId }),
        },
      }),
      'messages.send'
    );

    if (draftId) {
      await db.from('drafts').update({
        status: 'sent',
        gmail_message_id: sendResult.data.id,
      }).eq('id', draftId);
    }

    logger.info(`Email sent to ${to}, message id: ${sendResult.data.id}`);
    res.json({ messageId: sendResult.data.id, threadId: sendResult.data.threadId });
  } catch (error) {
    next(error);
  }
});

// ================================================================
// STATIC FRONTEND
// ================================================================

// Serve Vite-built frontend from dist/ (local dev) or landing page (Render)
const distPath = path.join(__dirname, '..', 'dist');
const distExists = fs.existsSync(path.join(distPath, 'index.html'));

if (distExists) {
  app.use(express.static(distPath));
}

// SPA fallback — serve index.html for all non-API routes
app.get('*', (req, res) => {
  if (req.path.startsWith('/api')) {
    return res.status(404).json({ error: 'API endpoint not found' });
  }

  if (distExists) {
    return res.sendFile(path.join(distPath, 'index.html'));
  }

  // Backend-only deployment (Render) — serve a styled landing page
  const frontendUrl = process.env.FRONTEND_URL || 'https://gmailrepeatless.vercel.app';
  res.send(`<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <title>Gmail Repeatless — API Server</title>
  <style>
    * { margin: 0; padding: 0; box-sizing: border-box; }
    body {
      min-height: 100vh;
      display: flex;
      align-items: center;
      justify-content: center;
      background: #0a0c10;
      color: #e2e8f0;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .card {
      background: linear-gradient(145deg, #111319, #161920);
      border: 1px solid #252830;
      border-radius: 16px;
      padding: 48px;
      max-width: 520px;
      text-align: center;
      box-shadow: 0 25px 60px rgba(0,0,0,0.5);
    }
    .emoji { font-size: 48px; margin-bottom: 16px; }
    h1 {
      font-size: 24px;
      font-weight: 700;
      background: linear-gradient(135deg, #6366F1, #22D3EE);
      -webkit-background-clip: text;
      -webkit-text-fill-color: transparent;
      margin-bottom: 8px;
    }
    .subtitle { color: #94a3b8; font-size: 14px; margin-bottom: 32px; }
    .status {
      display: inline-flex;
      align-items: center;
      gap: 8px;
      background: #1a1f2e;
      border: 1px solid #22D3EE33;
      border-radius: 100px;
      padding: 8px 20px;
      font-size: 13px;
      color: #22D3EE;
      margin-bottom: 24px;
    }
    .dot {
      width: 8px; height: 8px;
      background: #22D3EE;
      border-radius: 50%;
      animation: pulse 2s infinite;
    }
    @keyframes pulse {
      0%, 100% { opacity: 1; }
      50% { opacity: 0.4; }
    }
    .btn {
      display: inline-block;
      background: linear-gradient(135deg, #6366F1, #4F46E5);
      color: white;
      text-decoration: none;
      padding: 12px 32px;
      border-radius: 8px;
      font-weight: 600;
      font-size: 14px;
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .btn:hover {
      transform: translateY(-2px);
      box-shadow: 0 8px 25px rgba(99,102,241,0.4);
    }
    .info {
      margin-top: 32px;
      padding-top: 24px;
      border-top: 1px solid #252830;
      font-size: 12px;
      color: #64748b;
    }
    .info code {
      background: #1a1f2e;
      padding: 2px 6px;
      border-radius: 4px;
      color: #94a3b8;
    }
  </style>
</head>
<body>
  <div class="card">
    <div class="emoji">📧</div>
    <h1>Gmail Repeatless</h1>
    <p class="subtitle">AI-Powered Email Intelligence Platform</p>
    <div class="status">
      <span class="dot"></span>
      API Server Online
    </div>
    <br><br>
    <a href="${frontendUrl}" class="btn">Open App →</a>
    <div class="info">
      <p>Backend API: <code>${req.protocol}://${req.get('host')}/api</code></p>
      <p style="margin-top:4px">Powered by Gemini 2.5 Flash + NVIDIA NIM</p>
    </div>
  </div>
</body>
</html>`);
});

// ================================================================
// ERROR HANDLING
// ================================================================

app.use(errorHandler);

// Unhandled rejection safety net
process.on('unhandledRejection', (reason) => {
  logger.error('Unhandled Rejection:', reason);
});

// ================================================================
// START SERVER
// ================================================================

app.listen(config.port, () => {
  logger.info(`🚀 Gmail Repeatless API running on port ${config.port}`);
  logger.info(`   Environment: ${config.nodeEnv}`);
  logger.info(`   Frontend: ${distPath}`);
  logger.info(`   Gemini model: ${config.gemini.chatModel}`);
  logger.info(`   NIM model: ${config.nim.model}`);

  // Background sync: poll for new emails every 2 minutes
  // New emails are automatically categorized via the sync→categorize pipeline
  startBackgroundSync();
});

/**
 * Automatic background sync — polls for new emails every 2 minutes.
 * Only runs incremental sync (fast, delta-only) for accounts with a stored historyId.
 * Categorization is triggered automatically by the sync pipeline.
 */
async function startBackgroundSync() {
  const POLL_INTERVAL_MS = 2 * 60 * 1000; // 2 minutes

  setInterval(async () => {
    try {
      const { getSupabase } = await import('./src/db/client.js');
      const { incrementalSync } = await import('./src/gmail/sync.js');
      const db = getSupabase();

      // Find accounts with a historyId (means they've done at least one full sync)
      const { data: accounts } = await db.from('accounts')
        .select('id, google_email, gmail_history_id')
        .not('gmail_history_id', 'is', null);

      if (!accounts || accounts.length === 0) return;

      for (const account of accounts) {
        try {
          const result = await incrementalSync(account.id);
          if (result.added > 0) {
            logger.info(`[BackgroundSync] ${account.google_email}: +${result.added} new emails (auto-categorizing)`);
          }
        } catch (err) {
          // Don't crash on individual account failures
          logger.error(`[BackgroundSync] Failed for ${account.google_email}: ${err.message}`);
        }
      }
    } catch (err) {
      logger.error(`[BackgroundSync] Error: ${err.message}`);
    }
  }, POLL_INTERVAL_MS);

  logger.info(`   Background sync: polling every 2 minutes`);

  // On startup: categorize any uncategorized messages from previous syncs
  startupCategorize();
}

/**
 * On startup, categorize any messages left uncategorized from previous sessions.
 */
async function startupCategorize() {
  try {
    const { getSupabase } = await import('./src/db/client.js');
    const { batchCategorize } = await import('./src/services/categorization.js');
    const db = getSupabase();

    const { data: accounts } = await db.from('accounts').select('id, google_email');
    if (!accounts || accounts.length === 0) return;

    for (const account of accounts) {
      // Check how many uncategorized messages exist
      const { count } = await db.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', account.id)
        .eq('category', 'uncategorized');

      if (count && count > 0) {
        logger.info(`[Startup] Found ${count} uncategorized messages for ${account.google_email}, starting categorization...`);
        batchCategorize(account.id)
          .then((n) => logger.info(`[Startup] Categorized ${n} messages for ${account.google_email}`))
          .catch((err) => logger.error(`[Startup] Categorization failed: ${err.message}`));
      }
    }

    // Start embedding generation 30s after categorization (separate quota)
    setTimeout(() => startupEmbeddings(), 30000);
  } catch (err) {
    logger.error(`[Startup] Categorization check failed: ${err.message}`);
  }
}

/**
 * On startup, generate embeddings for messages that don't have them.
 * Uses Gemini embedding model (separate quota from chat model).
 */
async function startupEmbeddings() {
  try {
    const { getSupabase } = await import('./src/db/client.js');
    const { aiEmbed } = await import('./src/ai/router.js');
    const db = getSupabase();

    const { data: accounts } = await db.from('accounts').select('id, google_email');
    if (!accounts || accounts.length === 0) return;

    for (const account of accounts) {
      const { count } = await db.from('messages')
        .select('id', { count: 'exact', head: true })
        .eq('account_id', account.id)
        .is('embedding', null)
        .not('body_text', 'is', null);

      if (count && count > 0) {
        logger.info(`[Startup] Found ${count} messages without embeddings for ${account.google_email}, starting embedding generation...`);

        // Process in background
        (async () => {
          let processed = 0;
          let consecutiveErrors = 0;

          while (true) {
            const { data: msgs } = await db.from('messages')
              .select('id, subject, body_text, snippet')
              .eq('account_id', account.id)
              .is('embedding', null)
              .not('body_text', 'is', null)
              .limit(100);

            if (!msgs || msgs.length === 0) break;

            for (const msg of msgs) {
              try {
                const text = `${msg.subject || ''} ${msg.body_text || msg.snippet || ''}`.trim();
                if (!text) continue;

                const embedding = await aiEmbed(text.substring(0, 2000));
                await db.from('messages').update({ embedding }).eq('id', msg.id);
                processed++;
                consecutiveErrors = 0;

                // Throttle: 500ms between calls
                await new Promise(r => setTimeout(r, 500));
              } catch (err) {
                consecutiveErrors++;
                if (consecutiveErrors >= 5) {
                  logger.warn(`[Embeddings] ${consecutiveErrors} consecutive errors, pausing 60s...`);
                  await new Promise(r => setTimeout(r, 60000));
                  consecutiveErrors = 0;
                } else {
                  await new Promise(r => setTimeout(r, 3000));
                }
              }
            }

            if (processed % 100 === 0 && processed > 0) {
              logger.info(`[Embeddings] Progress: ${processed} embeddings generated for ${account.google_email}`);
            }
          }

          logger.info(`[Embeddings] Complete: ${processed} embeddings for ${account.google_email}`);
        })().catch(err => logger.error(`[Embeddings] Failed: ${err.message}`));
      }
    }
  } catch (err) {
    logger.error(`[Startup] Embedding check failed: ${err.message}`);
  }
}

export default app;

