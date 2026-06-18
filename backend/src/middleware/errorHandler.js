/**
 * Centralized Express error handler.
 * Returns consistent JSON error shape; never lets unhandled errors crash the process.
 */
import { logger } from './logger.js';

export function errorHandler(err, req, res, next) {
  // Log the full error internally
  logger.error(`Unhandled error on ${req.method} ${req.path}:`, err.message || err);
  if (err.stack && process.env.NODE_ENV !== 'production') {
    logger.debug(err.stack);
  }

  // Determine status code
  const statusCode = err.statusCode || err.status || 500;

  // Consistent error response shape
  res.status(statusCode).json({
    error: {
      message: err.message || 'Internal server error',
      code: err.code || 'INTERNAL_ERROR',
      ...(process.env.NODE_ENV !== 'production' && { stack: err.stack }),
    },
  });
}

/**
 * Helper to create errors with status codes
 */
export function createError(statusCode, message, code) {
  const err = new Error(message);
  err.statusCode = statusCode;
  err.code = code;
  return err;
}
