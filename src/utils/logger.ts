import winston from 'winston';
import path from 'path';

const logLevel = process.env.LOG_LEVEL || 'info';
const logFilePath = process.env.LOG_FILE_PATH || 'logs/app.log';

// Define log format
const logFormat = winston.format.combine(
  winston.format.timestamp({ format: 'YYYY-MM-DD HH:mm:ss' }),
  winston.format.errors({ stack: true }),
  winston.format.json(),
);

// Console format for development
const consoleFormat = winston.format.combine(
  winston.format.colorize(),
  winston.format.timestamp({ format: 'HH:mm:ss' }),
  winston.format.printf(({ timestamp, level, message, service, ...meta }) => {
    const serviceLabel = service ? `[${service}]` : '';
    const metaString = Object.keys(meta).length
      ? ` ${JSON.stringify(meta)}`
      : '';
    return `${timestamp} ${level} ${serviceLabel} ${message}${metaString}`;
  }),
);

// Create Winston logger
const logger = winston.createLogger({
  level: logLevel,
  format: logFormat,
  defaultMeta: { service: 'telegram-digest-bot' },
  transports: [
    // Console transport
    new winston.transports.Console({
      format: process.env.NODE_ENV === 'production' ? logFormat : consoleFormat,
    }),
  ],
});

// Add file transport in production
if (process.env.NODE_ENV === 'production') {
  logger.add(
    new winston.transports.File({
      filename: path.resolve(logFilePath),
      maxsize: 5242880, // 5MB
      maxFiles: 5,
      tailable: true,
    }),
  );

  // Separate error log file
  logger.add(
    new winston.transports.File({
      filename: path.resolve('logs/error.log'),
      level: 'error',
      maxsize: 5242880,
      maxFiles: 5,
      tailable: true,
    }),
  );
}

// Create logger factory function
export const createLogger = (service?: string): winston.Logger => {
  return logger.child({ service });
};

// Default logger export
export default logger;
