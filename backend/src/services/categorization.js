/**
 * Categorization service.
 * Uses NIM as primary (cheap, high-volume) with Gemini fallback.
 * Classifies each message/thread into one of the predefined categories.
 */
import { aiGenerate, waitForInteractive } from '../ai/router.js';
import { PROMPTS } from '../ai/prompts/index.js';
import { CATEGORIES } from '../config/index.js';
import { getSupabase } from '../db/client.js';
import { logger } from '../middleware/logger.js';

/**
 * Categorize a single message.
 * @returns {string} The assigned category
 */
export async function categorizeMessage(messageId) {
  const db = getSupabase();

  const { data: msg } = await db.from('messages')
    .select('id, subject, from_address, snippet, category, thread_id')
    .eq('id', messageId)
    .single();

  if (!msg) throw new Error(`Message ${messageId} not found`);
  if (msg.category !== 'uncategorized') return msg.category; // Already categorized

  // Yield to interactive requests (chat) before processing
  await waitForInteractive();

  const prompt = PROMPTS.categorize(msg.subject, msg.from_address, msg.snippet);
  const result = await aiGenerate('classify', { prompt, opts: { temperature: 0.0, maxTokens: 30 } });

  // Validate the response is a valid category
  const category = normalizeCategory(result.trim().toLowerCase());

  // Save to message
  await db.from('messages').update({ category }).eq('id', messageId);

  // IMMEDIATELY propagate to thread (so UI shows category right away)
  if (msg.thread_id && category !== 'uncategorized') {
    await db.from('threads').update({ category }).eq('id', msg.thread_id);
  }

  logger.info(`Categorized ${messageId} → ${category}`);
  return category;
}

/**
 * Batch categorize all uncategorized messages for an account.
 * Also propagates dominant category to thread level.
 */
export async function batchCategorize(accountId) {
  const db = getSupabase();
  let totalProcessed = 0;
  let consecutiveErrors = 0;

  // Process all uncategorized messages in batches of 100
  while (true) {
    const { data: uncategorized } = await db.from('messages')
      .select('id')
      .eq('account_id', accountId)
      .eq('category', 'uncategorized')
      .limit(100);

    if (!uncategorized || uncategorized.length === 0) break;

    for (const msg of uncategorized) {
      try {
        // Yield to interactive requests (chat) before processing
        await waitForInteractive();

        await categorizeMessage(msg.id);
        totalProcessed++;
        consecutiveErrors = 0;
        // Throttle: 500ms between requests to respect NIM rate limits
        await new Promise((r) => setTimeout(r, 500));
      } catch (err) {
        consecutiveErrors++;
        logger.error(`Failed to categorize message ${msg.id}: ${err.message}`);

        if (consecutiveErrors >= 5) {
          // Too many consecutive errors — pause for 60s to let rate limits reset
          logger.warn(`[Categorization] ${consecutiveErrors} consecutive errors, pausing 60s...`);
          await new Promise((r) => setTimeout(r, 60000));
          consecutiveErrors = 0;
        } else {
          // Brief pause on error
          await new Promise((r) => setTimeout(r, 5000));
        }
      }
    }

    logger.info(`Batch categorized ${totalProcessed} messages so far for account ${accountId}`);
  }

  // Propagate to thread level — use the most common category across messages
  if (totalProcessed > 0) {
    await propagateThreadCategories(accountId);
  }

  logger.info(`Categorization complete: ${totalProcessed} messages for account ${accountId}`);
  return totalProcessed;
}

/**
 * Set each thread's category to the dominant category of its messages.
 */
async function propagateThreadCategories(accountId) {
  const db = getSupabase();

  const { data: threads } = await db.from('threads')
    .select('id')
    .eq('account_id', accountId);

  if (!threads) return;

  for (const thread of threads) {
    const { data: messages } = await db.from('messages')
      .select('category')
      .eq('thread_id', thread.id)
      .neq('category', 'uncategorized');

    if (!messages || messages.length === 0) continue;

    // Find dominant category by count
    const counts = {};
    for (const m of messages) {
      counts[m.category] = (counts[m.category] || 0) + 1;
    }
    const dominant = Object.entries(counts).sort((a, b) => b[1] - a[1])[0][0];

    await db.from('threads').update({ category: dominant }).eq('id', thread.id);
  }
}

/**
 * Normalize and validate category string from AI output.
 */
function normalizeCategory(raw) {
  // Clean LLM output: strip quotes, periods, extra text
  let cleaned = raw
    .replace(/['"`.]/g, '')
    .replace(/^(the\s+)?category\s+(is|:)\s*/i, '')
    .replace(/\s*\(.*\)/, '')
    .trim()
    .toLowerCase();

  // Direct match
  if (CATEGORIES.includes(cleaned)) return cleaned;

  // Common variations and aliases
  const aliases = {
    'job': 'job_recruitment',
    'jobs': 'job_recruitment',
    'recruitment': 'job_recruitment',
    'job recruitment': 'job_recruitment',
    'job_recruitment': 'job_recruitment',
    'career': 'job_recruitment',
    'hiring': 'job_recruitment',
    'work': 'work_professional',
    'professional': 'work_professional',
    'work professional': 'work_professional',
    'work_professional': 'work_professional',
    'meeting': 'work_professional',
    'project': 'work_professional',
    'notification': 'notifications',
    'notifications': 'notifications',
    'alert': 'notifications',
    'alerts': 'notifications',
    'otp': 'notifications',
    'verification': 'notifications',
    'security': 'notifications',
    'newsletter': 'newsletter',
    'newsletters': 'newsletter',
    'news': 'newsletter',
    'digest': 'newsletter',
    'subscription': 'newsletter',
    'marketing': 'newsletter',
    'promotional': 'newsletter',
    'promo': 'newsletter',
    'finance': 'finance',
    'financial': 'finance',
    'billing': 'finance',
    'payment': 'finance',
    'invoice': 'finance',
    'receipt': 'finance',
    'transaction': 'finance',
    'banking': 'finance',
    'personal': 'personal',
    'social': 'personal',
    'family': 'personal',
    'friend': 'personal',
  };

  if (aliases[cleaned]) return aliases[cleaned];

  // Fuzzy: check if any alias is contained in the response
  for (const [alias, category] of Object.entries(aliases)) {
    if (cleaned.includes(alias)) return category;
  }

  return 'uncategorized';
}
