/**
 * Simple structured logger that logs every Gmail and AI API call's
 * latency and outcome (success/retry/failure).
 */

const LOG_LEVELS = { debug: 0, info: 1, warn: 2, error: 3 };
const CURRENT_LEVEL = LOG_LEVELS[process.env.LOG_LEVEL || 'info'] || 1;

function formatTime() {
  return new Date().toISOString();
}

export const logger = {
  debug(msg, ...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.debug) {
      console.debug(`[${formatTime()}] [DEBUG] ${msg}`, ...args);
    }
  },
  info(msg, ...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.info) {
      console.log(`[${formatTime()}] [INFO]  ${msg}`, ...args);
    }
  },
  warn(msg, ...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.warn) {
      console.warn(`[${formatTime()}] [WARN]  ${msg}`, ...args);
    }
  },
  error(msg, ...args) {
    if (CURRENT_LEVEL <= LOG_LEVELS.error) {
      console.error(`[${formatTime()}] [ERROR] ${msg}`, ...args);
    }
  },

  /**
   * Log an API call's outcome with timing.
   * Usage: const end = logger.apiCall('Gmail', 'messages.list'); ... end('success');
   */
  apiCall(service, operation) {
    const start = Date.now();
    return (outcome = 'success', extra = '') => {
      const latency = Date.now() - start;
      const level = outcome === 'success' ? 'info' : outcome === 'retry' ? 'warn' : 'error';
      logger[level](`[API] ${service}.${operation} → ${outcome} (${latency}ms) ${extra}`);
    };
  },
};
