/**
 * Compose and email sending routes.
 */
import { Router } from 'express';
import { requireAuth } from '../auth/session.js';
import { composeDraft, composeReply } from '../services/compose.js';
import { getGmailClient } from '../gmail/client.js';
import { buildNewMessage, buildReplyMessage } from '../gmail/mime.js';
import { withBackoff } from '../gmail/backoff.js';
import { getSupabase } from '../db/client.js';
import { logger } from '../middleware/logger.js';

const router = Router();

/**
 * POST /api/compose
 * Generate a new email draft from prompt
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const { prompt, tone, recipient, subject } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const result = await composeDraft(req.accountId, { prompt, tone, recipient, subject });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/threads/:threadId/reply
 * Generate a reply draft with full thread context
 */
router.post('/threads/:threadId/reply', requireAuth, async (req, res, next) => {
  try {
    const { prompt, tone } = req.body;
    if (!prompt) {
      return res.status(400).json({ error: 'Prompt is required' });
    }

    const result = await composeReply(req.accountId, req.params.threadId, { prompt, tone });
    res.json(result);
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/send
 * Send an email via Gmail API with proper MIME formatting
 */
router.post('/send', requireAuth, async (req, res, next) => {
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
      // Reply — fetch thread context for proper headers
      const { data: messages } = await db.from('messages')
        .select('message_id_header, in_reply_to_header, references_header, subject')
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
        inReplyToHeader: lastMsg?.in_reply_to_header,
        referencesHeaders: lastMsg?.references_header || [],
      });
      gmailThreadId = threadId;
    } else {
      // New message
      raw = buildNewMessage({ to, subject, body, from: account.google_email });
    }

    // Send via Gmail API
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

    // Update draft status if applicable
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

export default router;
