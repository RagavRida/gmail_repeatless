/**
 * Chat agent routes: conversations and RAG-powered messages
 */
import { Router } from 'express';
import { requireAuth } from '../auth/session.js';
import { processMessage } from '../services/chatAgent.js';
import { getSupabase } from '../db/client.js';
import { logger } from '../middleware/logger.js';

const router = Router();

/**
 * POST /api/chat/conversations
 * Create a new chat conversation
 */
router.post('/', requireAuth, async (req, res, next) => {
  try {
    const db = getSupabase();
    const { data: conversation } = await db.from('chat_conversations')
      .insert({
        account_id: req.accountId,
        title: 'New Investigation',
      })
      .select()
      .single();

    res.json({
      id: conversation.id,
      title: conversation.title,
      messages: [{
        id: `welcome-${conversation.id}`,
        role: 'assistant',
        content: 'Hello! I am your email intelligence agent. Ask me to synthesize, audit, draft, or correlate facts across your emails and newsletters.',
        time: 'Just now',
        citations: [],
      }],
    });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/chat/conversations
 * List all conversations for the user
 */
router.get('/', requireAuth, async (req, res, next) => {
  try {
    const db = getSupabase();
    const { data: conversations } = await db.from('chat_conversations')
      .select('id, title, created_at, updated_at')
      .eq('account_id', req.accountId)
      .order('updated_at', { ascending: false });

    // Get message count for each conversation
    const enriched = await Promise.all((conversations || []).map(async (conv) => {
      const { count } = await db.from('chat_messages')
        .select('*', { count: 'exact', head: true })
        .eq('conversation_id', conv.id);

      return {
        id: conv.id,
        title: conv.title,
        messageCount: count || 0,
      };
    }));

    res.json({ conversations: enriched });
  } catch (error) {
    next(error);
  }
});

/**
 * GET /api/chat/conversations/:id/messages
 * Get all messages in a conversation
 */
router.get('/:id/messages', requireAuth, async (req, res, next) => {
  try {
    const db = getSupabase();
    const { data: messages } = await db.from('chat_messages')
      .select('*')
      .eq('conversation_id', req.params.id)
      .order('created_at', { ascending: true });

    const formatted = (messages || []).map((msg) => ({
      id: msg.id,
      role: msg.role,
      content: msg.content,
      time: formatTime(msg.created_at),
      citations: msg.sources?.map((s) => ({
        sender: extractSenderName(s.from_address),
        senderEmail: extractEmail(s.from_address),
        subject: s.subject,
        time: '',
      })) || [],
    }));

    res.json({ messages: formatted });
  } catch (error) {
    next(error);
  }
});

/**
 * POST /api/chat/conversations/:id/messages
 * Send a message to the chat agent, get AI response with sources
 */
router.post('/:id/messages', requireAuth, async (req, res) => {
  try {
    const { message } = req.body;
    if (!message) {
      return res.status(400).json({ error: 'Message is required' });
    }

    const result = await processMessage(req.accountId, req.params.id, message);

    res.json({
      content: result.content,
      sources: result.sources || [],
      citations: result.citations || [],
      time: formatTime(new Date().toISOString()),
    });
  } catch (error) {
    // Even if processMessage itself somehow throws, never send raw errors to the user
    logger.error(`[ChatRoute] Unhandled error: ${error.message}`);
    res.json({
      content: 'I encountered an unexpected error. Please try again in a moment. If this keeps happening, the AI services may be temporarily unavailable.',
      sources: [],
      citations: [],
      time: formatTime(new Date().toISOString()),
    });
  }
});

function formatTime(dateStr) {
  if (!dateStr) return 'Just now';
  const d = new Date(dateStr);
  const today = new Date();
  const isToday = d.toDateString() === today.toDateString();
  const time = d.toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' });
  return isToday ? `Today, ${time}` : d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' }) + `, ${time}`;
}

function extractSenderName(fromAddress) {
  if (!fromAddress) return 'Unknown';
  const match = fromAddress.match(/^"?(.+?)"?\s*</);
  return match ? match[1].trim() : fromAddress?.split('@')[0] || 'Unknown';
}

function extractEmail(fromAddress) {
  if (!fromAddress) return '';
  const match = fromAddress.match(/<(.+?)>/);
  return match ? match[1] : fromAddress;
}

export default router;
