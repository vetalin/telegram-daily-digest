/**
 * Centralized error handling middleware
 */

import { Request, Response, NextFunction } from 'express';
import { ZodError } from 'zod';
import logger from '../utils/logger';

// Base error classes
export class AppError extends Error {
  constructor(
    public statusCode: number,
    message: string,
    public code?: string,
    public isOperational = true,
  ) {
    super(message);
    this.name = 'AppError';
    Error.captureStackTrace(this, this.constructor);
  }
}

export class ValidationError extends AppError {
  constructor(
    message: string,
    public details?: any,
  ) {
    super(400, message, 'VALIDATION_ERROR');
    this.name = 'ValidationError';
  }
}

export class NotFoundError extends AppError {
  constructor(resource: string) {
    super(404, `${resource} not found`, 'NOT_FOUND');
    this.name = 'NotFoundError';
  }
}

export class ConflictError extends AppError {
  constructor(message: string) {
    super(409, message, 'CONFLICT');
    this.name = 'ConflictError';
  }
}

export class DatabaseError extends AppError {
  constructor(message: string, originalError?: Error) {
    super(500, 'Database operation failed', 'DATABASE_ERROR');
    this.name = 'DatabaseError';
    if (originalError) {
      this.stack = originalError.stack;
    }
  }
}

// Request logging middleware
export const requestLogger = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const start = Date.now();

  // Log request
  logger.info('Incoming request', {
    method: req.method,
    url: req.url,
    path: req.path,
    query: req.query,
    userAgent: req.get('User-Agent'),
    ip: req.ip,
    headers: {
      'content-type': req.get('Content-Type'),
      'content-length': req.get('Content-Length'),
    },
  });

  // Override res.json to log response
  const originalJson = res.json;
  res.json = function (body: any) {
    const duration = Date.now() - start;

    logger.info('Response sent', {
      method: req.method,
      url: req.url,
      statusCode: res.statusCode,
      duration: `${duration}ms`,
      responseSize: JSON.stringify(body).length,
    });

    return originalJson.call(this, body);
  };

  next();
};

// Validation error handler
const handleValidationError = (error: ZodError): AppError => {
  const messages = error.errors.map((err) => {
    const path = err.path.join('.');
    return `${path}: ${err.message}`;
  });

  return new ValidationError(
    `Validation failed: ${messages.join(', ')}`,
    error.errors,
  );
};

// Database error handler
const handleDatabaseError = (error: Error): AppError => {
  logger.error('Database error details', {
    name: error.name,
    message: error.message,
    stack: error.stack,
  });

  // Handle specific PostgreSQL errors
  if ('code' in error) {
    const pgError = error as any;

    switch (pgError.code) {
      case '23505': // unique_violation
        return new ConflictError('Resource already exists');
      case '23503': // foreign_key_violation
        return new ValidationError('Referenced resource does not exist');
      case '23502': // not_null_violation
        return new ValidationError('Required field is missing');
      case '23514': // check_violation
        return new ValidationError('Data violates constraint');
      default:
        return new DatabaseError('Database operation failed', error);
    }
  }

  return new DatabaseError('Database operation failed', error);
};

// Main error handling middleware
export const errorHandler = (
  error: Error,
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  let appError: AppError;

  // Handle different error types
  if (error instanceof AppError) {
    appError = error;
  } else if (error instanceof ZodError) {
    appError = handleValidationError(error);
  } else if (error.name === 'JsonWebTokenError') {
    appError = new AppError(401, 'Invalid token', 'INVALID_TOKEN');
  } else if (error.name === 'TokenExpiredError') {
    appError = new AppError(401, 'Token expired', 'TOKEN_EXPIRED');
  } else if (
    error.message.includes('database') ||
    error.message.includes('query')
  ) {
    appError = handleDatabaseError(error);
  } else {
    // Unknown error - don't leak details in production
    appError = new AppError(
      500,
      process.env.NODE_ENV === 'production'
        ? 'Something went wrong'
        : error.message,
      'INTERNAL_ERROR',
      false,
    );
  }

  // Log error based on severity
  const logData = {
    error: {
      name: appError.name,
      message: appError.message,
      code: appError.code,
      statusCode: appError.statusCode,
      stack: appError.stack,
    },
    request: {
      method: req.method,
      url: req.url,
      path: req.path,
      query: req.query,
      body: req.body,
      ip: req.ip,
      userAgent: req.get('User-Agent'),
    },
  };

  if (appError.statusCode >= 500) {
    logger.error('Server error', logData);
  } else if (appError.statusCode >= 400) {
    logger.warn('Client error', logData);
  } else {
    logger.info('Request error', logData);
  }

  // Send error response
  const response: any = {
    error: {
      message: appError.message,
      code: appError.code || 'UNKNOWN_ERROR',
    },
  };

  // Include additional details in development
  if (process.env.NODE_ENV === 'development') {
    response.error.details = appError.details;
    if (!appError.isOperational) {
      response.error.stack = appError.stack;
    }
  }

  res.status(appError.statusCode).json(response);
};

// Async error wrapper for route handlers
export const asyncHandler = (fn: Function) => {
  return (req: Request, res: Response, next: NextFunction) => {
    Promise.resolve(fn(req, res, next)).catch(next);
  };
};

// 404 handler for unmatched routes
export const notFoundHandler = (
  req: Request,
  res: Response,
  next: NextFunction,
) => {
  const error = new NotFoundError(`Route ${req.method} ${req.path}`);
  next(error);
};

// Graceful shutdown handler
export const gracefulShutdown = (server: any, logger: any) => {
  return (signal: string) => {
    logger.info(`Received ${signal}. Starting graceful shutdown...`);

    server.close((err: Error) => {
      if (err) {
        logger.error('Error during server shutdown:', err);
        process.exit(1);
      }

      logger.info('Server shut down gracefully');
      process.exit(0);
    });

    // Force shutdown after timeout
    setTimeout(() => {
      logger.error('Forcing shutdown after timeout');
      process.exit(1);
    }, 10000);
  };
};
