import dotenv from 'dotenv';
import express from 'express';
import helmet from 'helmet';
import cors from 'cors';
import throttle from 'express-throttle';
import { createLogger } from './utils/logger';
import userRoutes from './routes/users';
import {
  requestLogger,
  errorHandler,
  notFoundHandler,
} from './middleware/errorHandler';
import { digestService } from './services';

// Load environment variables
dotenv.config();

const app = express();
const PORT = process.env.PORT || 3000;
const logger = createLogger('Main');

// Security middleware
app.use(helmet());
app.use(cors());
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

const throttleOptions = {
  rate: '100/m',
  burst: 20,
  on_throttled: (
    req: express.Request,
    res: express.Response,
    next: express.NextFunction,
    bucket: any,
  ) => {
    res
      .status(503)
      .json({ message: 'Too many requests, please try again later.' });
  },
};

app.use(throttle(throttleOptions));

// Request logging middleware
app.use(requestLogger);

// Health check endpoint
app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'OK',
    timestamp: new Date().toISOString(),
    uptime: process.uptime(),
    environment: process.env.NODE_ENV || 'development',
  });
});

// Root endpoint
app.get('/', (req, res) => {
  res.json({
    message: 'Telegram Daily Digest Bot API',
    version: '1.0.0',
    status: 'running',
  });
});

// API routes
app.use('/api/users', userRoutes);

// 404 handler for unmatched routes
app.use(notFoundHandler);

// Global error handling middleware (must be last)
app.use(errorHandler);

// Start server
const server = app.listen(PORT, () => {
  logger.info(`🚀 Server is running on port ${PORT}`);
  logger.info(`📝 Environment: ${process.env.NODE_ENV || 'development'}`);
  logger.info(`🔗 Health check: http://localhost:${PORT}/health`);

  // Schedule daily digests
  digestService.scheduleDailyDigest();
});

// Graceful shutdown
const gracefulShutdown = (signal: string): void => {
  logger.info(`📊 Received ${signal}. Starting graceful shutdown...`);

  server.close(() => {
    logger.info('✅ HTTP server closed');
    process.exit(0);
  });

  // Force shutdown after 10 seconds
  setTimeout(() => {
    logger.error('❌ Forced shutdown after timeout');
    process.exit(1);
  }, 10000);
};

process.on('SIGTERM', () => gracefulShutdown('SIGTERM'));
process.on('SIGINT', () => gracefulShutdown('SIGINT'));

// Handle uncaught exceptions
process.on('uncaughtException', (error: Error) => {
  logger.error('Uncaught Exception:', error);
  process.exit(1);
});

process.on(
  'unhandledRejection',
  (reason: unknown, promise: Promise<unknown>) => {
    logger.error('Unhandled Rejection at:', promise, 'reason:', reason);
    process.exit(1);
  },
);

export default app;
