/**
 * Retry wrapper with exponential backoff and jitter for Gmail API calls.
 * Handles 429 (rate limit) and 403 (rateLimitExceeded) responses.
 * Honors Retry-After header when present.
 */
import { logger } from '../middleware/logger.js';

const MAX_RETRIES = 5;
const BASE_DELAY_MS = 500;
const MAX_DELAY_MS = 32000;
const JITTER_MAX_MS = 250;

/**
 * Execute fn with exponential backoff on transient failures.
 * @param {Function} fn - Async function to execute
 * @param {string} operationName - For logging
 * @param {number} maxRetries - Max retry attempts
 */
export async function withBackoff(fn, operationName = 'api_call', maxRetries = MAX_RETRIES) {
  let lastError;

  for (let attempt = 0; attempt <= maxRetries; attempt++) {
    const logEnd = logger.apiCall('Gmail', operationName);

    try {
      const result = await fn();
      logEnd('success');
      return result;
    } catch (error) {
      lastError = error;
      const status = error?.response?.status || error?.code;
      const isRateLimit = status === 429 || (status === 403 && isRateLimitError(error));
      const isServerError = status >= 500 && status < 600;

      if (!isRateLimit && !isServerError) {
        logEnd('failure', `non-retryable: ${error.message}`);
        throw error;
      }

      if (attempt >= maxRetries) {
        logEnd('failure', `max retries exceeded after ${attempt + 1} attempts`);
        throw error;
      }

      // Calculate backoff delay
      let delay = Math.min(BASE_DELAY_MS * Math.pow(2, attempt), MAX_DELAY_MS);

      // Honor Retry-After header if present
      const retryAfter = error?.response?.headers?.['retry-after'];
      if (retryAfter) {
        const retryMs = parseInt(retryAfter, 10) * 1000;
        if (!isNaN(retryMs)) delay = Math.max(delay, retryMs);
      }

      // Add jitter to prevent thundering herd
      delay += Math.random() * JITTER_MAX_MS;

      logEnd('retry', `attempt ${attempt + 1}/${maxRetries}, waiting ${Math.round(delay)}ms`);
      await sleep(delay);
    }
  }

  throw lastError;
}

function isRateLimitError(error) {
  const message = error?.message || '';
  const errors = error?.errors || error?.response?.data?.error?.errors || [];
  return (
    message.includes('rateLimitExceeded') ||
    message.includes('userRateLimitExceeded') ||
    errors.some((e) => e.reason === 'rateLimitExceeded' || e.reason === 'userRateLimitExceeded')
  );
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}
