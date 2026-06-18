/**
 * AI Router: model selection + automatic fallback + retry for interactive tasks.
 *
 * Key design:
 * - Background tasks (classify) pause when interactive requests (generate/chat) arrive
 * - Interactive tasks retry with backoff up to 3 times
 * - Gemini primary for reasoning, NIM primary for classification
 * - Automatic fallback on 429/failure
 */
import * as gemini from './gemini.js';
import * as nim from './nim.js';
import { logger } from '../middleware/logger.js';

// Global pause flag: when true, background tasks should wait
let _interactivePending = 0;

/**
 * Check if background tasks should pause to let interactive requests through.
 */
export function shouldPauseBackground() {
  return _interactivePending > 0;
}

/**
 * Wait for interactive requests to complete before continuing background work.
 * Call this in background loops (categorization, embedding) to yield priority.
 */
export async function waitForInteractive() {
  while (_interactivePending > 0) {
    await new Promise(r => setTimeout(r, 2000));
  }
}

/**
 * Generate text with automatic provider fallback and retry for interactive tasks.
 *
 * @param {'generate'|'classify'|'chat'} task - Task type
 * @param {object} params - Task-specific parameters
 * @returns {string} Generated text
 */
export async function aiGenerate(task, params) {
  const isInteractive = task === 'generate' || task === 'chat';

  if (isInteractive) {
    _interactivePending++;
  }

  try {
    if (isInteractive) {
      // Interactive tasks get retry logic
      return await retryWithBackoff(() => attemptGenerate(task, params), {
        maxRetries: 3,
        baseDelayMs: 3000,
        taskName: task,
      });
    }

    // Background tasks (classify) — single attempt, no retry
    return await attemptGenerate(task, params);
  } finally {
    if (isInteractive) {
      _interactivePending--;
    }
  }
}

/**
 * Single attempt: try primary provider, fall back to secondary.
 */
async function attemptGenerate(task, params) {
  const { primary, fallback } = getProviderOrder(task);

  try {
    return await callProvider(primary, task, params);
  } catch (primaryError) {
    const isRL = isRateLimitError(primaryError);
    logger.warn(`[Router] ${primary} ${isRL ? 'rate-limited' : 'failed'} for ${task}, falling back to ${fallback}`);

    try {
      return await callProvider(fallback, task, params);
    } catch (fallbackError) {
      logger.error(`[Router] Both providers failed for ${task}. Primary: ${primaryError.message}, Fallback: ${fallbackError.message}`);
      throw new Error(`AI generation failed: both ${primary} and ${fallback} returned errors`);
    }
  }
}

/**
 * Retry with exponential backoff.
 */
async function retryWithBackoff(fn, { maxRetries = 3, baseDelayMs = 3000, taskName = '' }) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    try {
      return await fn();
    } catch (error) {
      lastError = error;

      if (attempt < maxRetries && isRateLimitError(error)) {
        const delay = baseDelayMs * Math.pow(2, attempt) + Math.random() * 1000;
        logger.info(`[Router] Retry ${attempt + 1}/${maxRetries} for ${taskName} in ${Math.round(delay)}ms...`);
        await new Promise(r => setTimeout(r, delay));
      } else if (attempt < maxRetries) {
        // Non-rate-limit error — shorter retry
        const delay = 1000 * (attempt + 1);
        logger.info(`[Router] Retry ${attempt + 1}/${maxRetries} for ${taskName} in ${delay}ms...`);
        await new Promise(r => setTimeout(r, delay));
      }
    }
  }

  throw lastError;
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
    error?.message?.includes('quota') ||
    error?.message?.includes('RESOURCE_EXHAUSTED')
  );
}
