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
import { validateInput, validateOutput, validateComposedEmail, getRefusalMessage, logGuardrailEvent } from './guardrails.js';

/**
 * Strip LLM preamble and markdown artifacts from generated email output.
 * Even with "Return ONLY the email body", models occasionally prepend
 * "Here is the email:" or wrap in markdown code fences.
 */
function cleanEmailOutput(text) {
  return text
    .replace(/^(here is|here's|email:|draft:|reply:)[^\n]*\n/i, '')
    .replace(/```[a-z]*\n?/g, '')
    .replace(/^["']+|["']+$/g, '')
    .replace(/\n*(Best regards|Sincerely|Warm regards|Kind regards|Thanks|Cheers|Best),?\n.*/si, '')
    .trim();
}

/**
 * Build thread context for reply prompts.
 * For threads with >3 messages: summarizes older messages (1 line each)
 * and keeps only the last 3 verbatim. This prevents token waste and
 * keeps the model focused on the latest exchange.
 */
function buildThreadContext(messages) {
  const MAX_RECENT = 3;

  const formatMessage = (m, i) => {
    const from = m.from_address || m.sender || 'Unknown';
    const date = m.internal_date || m.time || '';
    const body = m.body_text || m.body || m.snippet || '[no content]';
    return `--- Message ${i + 1} ---\nFrom: ${from}\nDate: ${date}\n${body}`;
  };

  if (messages.length <= MAX_RECENT) {
    // Short thread — pass all messages verbatim
    const formatted = messages.map((m, i) => formatMessage(m, i)).join('\n\n');
    return `Thread (${messages.length} messages):\n${formatted}`;
  }

  // Long thread — summarize older, keep recent verbatim
  const olderMessages = messages.slice(0, -MAX_RECENT);
  const recentMessages = messages.slice(-MAX_RECENT);

  const olderSummary = olderMessages.map((m) => {
    const from = m.from_address || m.sender || 'Unknown';
    const body = (m.body_text || m.snippet || '').substring(0, 100);
    return `- ${from}: ${body}...`;
  }).join('\n');

  const recentFormatted = recentMessages.map((m, i) =>
    formatMessage(m, olderMessages.length + i)
  ).join('\n\n');

  return `Thread summary (older messages):\n${olderSummary}\n\nRecent messages (verbatim, newest last):\n${recentFormatted}`;
}

/**
 * Generate a new email draft from a prompt.
 * @param {string} accountId
 * @param {{ prompt: string, tone?: string, recipient?: string, subject?: string }} params
 * @returns {{ subject: string, body: string, draftId: string }}
 */
export async function composeDraft(accountId, { prompt, tone, recipient, subject: userSubject }) {
  const db = getSupabase();

  // ── INPUT GUARDRAILS ──
  const inputCheck = validateInput(prompt, 'compose');
  if (!inputCheck.safe) {
    logGuardrailEvent('INPUT_BLOCKED', { context: 'compose', violations: inputCheck.violations });
    throw new Error(getRefusalMessage(inputCheck.violations));
  }

  // Generate email body
  const bodyPrompt = PROMPTS.composeNew(inputCheck.sanitized, tone);
  let body = await aiGenerate('generate', {
    prompt: bodyPrompt,
    opts: { temperature: 0.5, maxTokens: 800 },
  });

  // ── OUTPUT STRIPPING ──
  body = cleanEmailOutput(body);

  // ── OUTPUT GUARDRAILS ──
  const outputCheck = validateOutput(body, 'compose');
  body = outputCheck.filtered;

  // ── COMPOSE SAFETY CHECK ──
  const composeCheck = validateComposedEmail(body, userSubject);
  if (!composeCheck.safe) {
    logGuardrailEvent('COMPOSE_BLOCKED', { context: 'compose', violations: composeCheck.violations });
    throw new Error('The generated email was flagged for safety concerns. Please rephrase your request.');
  }
  if (composeCheck.warnings.length > 0) {
    logGuardrailEvent('COMPOSE_WARNING', { context: 'compose', warnings: composeCheck.warnings });
  }

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

  // ── INPUT GUARDRAILS ──
  const inputCheck = validateInput(prompt, 'compose');
  if (!inputCheck.safe) {
    logGuardrailEvent('INPUT_BLOCKED', { context: 'reply', violations: inputCheck.violations });
    throw new Error(getRefusalMessage(inputCheck.violations));
  }

  // Build thread context with truncation for long threads
  const threadContext = buildThreadContext(messages);

  const replyPrompt = PROMPTS.composeReply(inputCheck.sanitized, tone, threadContext);
  let body = await aiGenerate('generate', {
    prompt: replyPrompt,
    opts: { temperature: 0.5, maxTokens: 800 },
  });

  // ── OUTPUT STRIPPING ──
  body = cleanEmailOutput(body);

  // ── OUTPUT GUARDRAILS ──
  const outputCheck = validateOutput(body, 'compose');
  body = outputCheck.filtered;

  const composeCheck = validateComposedEmail(body, messages[0].subject);
  if (!composeCheck.safe) {
    logGuardrailEvent('COMPOSE_BLOCKED', { context: 'reply', violations: composeCheck.violations });
    throw new Error('The generated reply was flagged for safety concerns. Please rephrase your request.');
  }

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
