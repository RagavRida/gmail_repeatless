/**
 * Summarization service.
 * - Per-message summary: generated at sync time, cached (not regenerated on every read)
 * - Thread-level summary: regenerated when a new message lands in the thread
 */
import { aiGenerate } from '../ai/router.js';
import { PROMPTS } from '../ai/prompts/index.js';
import { getSupabase } from '../db/client.js';
import { logger } from '../middleware/logger.js';

/**
 * Summarize a single message (if not already summarized).
 */
export async function summarizeMessage(messageId) {
  const db = getSupabase();

  const { data: msg } = await db.from('messages')
    .select('id, subject, from_address, body_text, snippet, ai_summary')
    .eq('id', messageId)
    .single();

  if (!msg) throw new Error(`Message ${messageId} not found`);
  if (msg.ai_summary) return msg.ai_summary; // Already cached

  const content = msg.body_text || msg.snippet || '';
  if (!content.trim()) return null;

  const prompt = PROMPTS.messageSummary(msg.subject, msg.from_address, content);
  const summary = await aiGenerate('generate', { prompt, opts: { temperature: 0.2, maxTokens: 200 } });

  await db.from('messages').update({ ai_summary: summary }).eq('id', messageId);
  logger.info(`Summarized message ${messageId}`);
  return summary;
}

/**
 * Summarize an entire thread by processing all its messages in order.
 */
export async function summarizeThread(threadId) {
  const db = getSupabase();

  const { data: messages } = await db.from('messages')
    .select('id, from_address, internal_date, body_text, snippet, subject')
    .eq('thread_id', threadId)
    .order('internal_date', { ascending: true });

  if (!messages || messages.length === 0) return null;

  const prompt = PROMPTS.threadSummary(
    messages[0].subject,
    messages.map((m) => ({
      from_address: m.from_address,
      internal_date: m.internal_date,
      body_text: m.body_text || m.snippet,
    }))
  );

  const summary = await aiGenerate('generate', { prompt, opts: { temperature: 0.2, maxTokens: 400 } });

  await db.from('threads').update({
    ai_summary: summary,
    ai_summary_generated_at: new Date().toISOString(),
  }).eq('id', threadId);

  logger.info(`Summarized thread ${threadId} (${messages.length} messages)`);
  return summary;
}

/**
 * Batch summarize all unsummarized messages for an account.
 * Called after sync to process new messages.
 */
export async function batchSummarize(accountId) {
  const db = getSupabase();

  // Find messages without summaries
  const { data: unsummarized } = await db.from('messages')
    .select('id')
    .eq('account_id', accountId)
    .is('ai_summary', null)
    .not('body_text', 'is', null)
    .limit(50); // Process in batches to avoid overwhelming AI APIs

  if (!unsummarized || unsummarized.length === 0) return 0;

  let processed = 0;
  for (const msg of unsummarized) {
    try {
      await summarizeMessage(msg.id);
      processed++;
    } catch (err) {
      logger.error(`Failed to summarize message ${msg.id}: ${err.message}`);
    }
  }

  // Also summarize threads that have new messages
  const { data: threads } = await db.from('threads')
    .select('id')
    .eq('account_id', accountId)
    .or('ai_summary.is.null,ai_summary_generated_at.lt.' + new Date(Date.now() - 60000).toISOString())
    .limit(20);

  if (threads) {
    for (const thread of threads) {
      try {
        await summarizeThread(thread.id);
      } catch (err) {
        logger.error(`Failed to summarize thread ${thread.id}: ${err.message}`);
      }
    }
  }

  logger.info(`Batch summarized ${processed} messages for account ${accountId}`);
  return processed;
}
