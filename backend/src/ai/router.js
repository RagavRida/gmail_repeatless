/**
 * AI Router: model selection + automatic fallback logic.
 *
 * Role split rationale (documented in README):
 * - Gemini (primary): High-stakes reasoning — RAG chat synthesis, thread-aware reply
 *   drafting, and summarization. Benefits from large context window and strong
 *   instruction-following.
 * - NIM (secondary): Cheap, high-volume classification (email categorization during sync).
 *   Also serves as automatic fallback if Gemini returns 429 or fails, so a rate limit
 *   from one provider doesn't take down the feature.
 *
 * The router wraps both clients behind a unified interface.
 */
import * as gemini from './gemini.js';
import * as nim from './nim.js';
import { logger } from '../middleware/logger.js';

/**
 * Generate text with automatic provider fallback.
 * Primary → Gemini, Fallback → NIM (or vice versa for classify).
 *
 * @param {'generate'|'classify'|'chat'} task - Task type
 * @param {object} params - Task-specific parameters
 * @returns {string} Generated text
 */
export async function aiGenerate(task, params) {
  const { primary, fallback } = getProviderOrder(task);

  try {
    return await callProvider(primary, task, params);
  } catch (primaryError) {
    const isRateLimit = isRateLimitError(primaryError);
    const logMsg = isRateLimit ? 'rate-limited' : 'failed';
    logger.warn(`[Router] ${primary} ${logMsg} for ${task}, falling back to ${fallback}: ${primaryError.message}`);

    try {
      return await callProvider(fallback, task, params);
    } catch (fallbackError) {
      logger.error(`[Router] Both providers failed for ${task}. Primary: ${primaryError.message}, Fallback: ${fallbackError.message}`);
      throw new Error(`AI generation failed: both ${primary} and ${fallback} returned errors`);
    }
  }
}

/**
 * Generate embeddings (Gemini only — NIM doesn't offer embeddings).
 */
export async function aiEmbed(text) {
  return gemini.generateEmbedding(text);
}

/**
 * Batch embed texts.
 */
export async function aiEmbedBatch(texts) {
  return gemini.generateEmbeddings(texts);
}

// ================================================================
// Internal
// ================================================================

function getProviderOrder(task) {
  // Classify tasks use NIM as primary (cheap, high-volume)
  if (task === 'classify') {
    return { primary: 'nim', fallback: 'gemini' };
  }
  // Everything else uses Gemini as primary (stronger reasoning)
  return { primary: 'gemini', fallback: 'nim' };
}

async function callProvider(provider, task, params) {
  if (provider === 'gemini') {
    if (task === 'chat' && params.messages) {
      return gemini.generateChat(params.messages, params.opts || {});
    }
    return gemini.generateContent(params.prompt, params.opts || {});
  }

  if (provider === 'nim') {
    if (task === 'chat' && params.messages) {
      return nim.nimChat(params.messages, params.opts || {});
    }
    return nim.nimComplete(params.prompt, params.opts || {});
  }

  throw new Error(`Unknown provider: ${provider}`);
}

function isRateLimitError(error) {
  const status = error?.status || error?.response?.status;
  return (
    status === 429 ||
    error?.message?.includes('429') ||
    error?.message?.includes('rate') ||
    error?.message?.includes('quota')
  );
}
