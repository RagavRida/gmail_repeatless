/**
 * Compose & Reply service.
 * - Compose: takes prompt → generates subject + body draft
 * - Reply: takes prompt + full thread context → generates reply body
 * Nothing auto-sends — always returns a draft for user review.
 */
import { aiGenerate } from '../ai/router.js';
import { PROMPTS } from '../ai/prompts/index.js';
import { getSupabase } from '../db/client.js';
import { logger } from '../middleware/logger.js';

/**
 * Generate a new email draft from a prompt.
 * @param {string} accountId
 * @param {{ prompt: string, tone?: string, recipient?: string, subject?: string }} params
 * @returns {{ subject: string, body: string, draftId: string }}
 */
export async function composeDraft(accountId, { prompt, tone, recipient, subject: userSubject }) {
  const db = getSupabase();

  // Generate email body
  const bodyPrompt = PROMPTS.composeNew(prompt, tone);
  const body = await aiGenerate('generate', {
    prompt: bodyPrompt,
    opts: { temperature: 0.5, maxTokens: 800 },
  });

  // Generate subject if not provided
  let subject = userSubject;
  if (!subject) {
    const subjectPrompt = PROMPTS.composeSubject(prompt, body);
    subject = await aiGenerate('generate', {
      prompt: subjectPrompt,
      opts: { temperature: 0.3, maxTokens: 50 },
    });
    // Clean up — remove quotes if the model wrapped the subject
    subject = subject.replace(/^["']|["']$/g, '').trim();
  }

  // Store as draft
  const { data: draft } = await db.from('drafts').insert({
    account_id: accountId,
    kind: 'new',
    prompt,
    subject,
    body,
    status: 'draft',
  }).select().single();

  logger.info(`Composed new draft ${draft.id} for account ${accountId}`);
  return { subject, body, draftId: draft.id };
}

/**
 * Generate a reply draft with full thread context.
 * @param {string} accountId
 * @param {string} threadId
 * @param {{ prompt: string, tone?: string }} params
 * @returns {{ body: string, draftId: string }}
 */
export async function composeReply(accountId, threadId, { prompt, tone }) {
  const db = getSupabase();

  // Fetch all messages in the thread, ordered chronologically
  const { data: messages } = await db.from('messages')
    .select('id, from_address, internal_date, body_text, snippet, subject, message_id_header, in_reply_to_header, references_header')
    .eq('thread_id', threadId)
    .order('internal_date', { ascending: true });

  if (!messages || messages.length === 0) {
    throw new Error(`No messages found in thread ${threadId}`);
  }

  const replyPrompt = PROMPTS.composeReply(prompt, tone, messages);
  const body = await aiGenerate('generate', {
    prompt: replyPrompt,
    opts: { temperature: 0.5, maxTokens: 800 },
  });

  // Store as draft
  const { data: draft } = await db.from('drafts').insert({
    account_id: accountId,
    thread_id: threadId,
    kind: 'reply',
    prompt,
    subject: messages[0].subject,
    body,
    status: 'draft',
  }).select().single();

  logger.info(`Composed reply draft ${draft.id} for thread ${threadId}`);
  return { body, draftId: draft.id, subject: messages[0].subject };
}
