import dotenv from 'dotenv';
import { decrypt } from './utils/crypto';
import { createLogger } from './utils/logger';

dotenv.config();

const logger = createLogger('Config');

const encryptionKey = process.env.ENCRYPTION_KEY;

const config = {
  botToken: process.env.BOT_TOKEN || '',
  webhookUrl: process.env.WEBHOOK_URL,
  apiId: process.env.API_ID ? parseInt(process.env.API_ID, 10) : undefined,
  apiHash: process.env.API_HASH || '',
  phoneNumber: process.env.PHONE_NUMBER,
  sessionName: process.env.SESSION_NAME || 'userbot_session',
  openaiApiKey: process.env.OPENAI_API_KEY || '',
  databaseUrl: process.env.DATABASE_URL || '',
  redisUrl: process.env.REDIS_URL || '',
  port: process.env.PORT || 3000,
  nodeEnv: process.env.NODE_ENV || 'development',
  jwtSecret: process.env.JWT_SECRET || '',
  encryptionKey: encryptionKey,
  logLevel: process.env.LOG_LEVEL || 'info',
};

const decryptValue = (value: string | undefined): string | undefined => {
  if (value && value.startsWith('enc_') && encryptionKey) {
    try {
      return decrypt(value.substring(4), encryptionKey);
    } catch (error) {
      logger.error(`Failed to decrypt value: ${value}`, error);
      return undefined;
    }
  }
  return value;
};

// Decrypt encrypted values
for (const key in config) {
  if (Object.prototype.hasOwnProperty.call(config, key)) {
    const value = (config as any)[key];
    if (typeof value === 'string') {
      (config as any)[key] = decryptValue(value);
    }
  }
}

// Validation for critical values
if (!config.botToken) {
  logger.error('BOT_TOKEN is missing in config.');
  process.exit(1);
}

if (config.nodeEnv !== 'development' && !config.webhookUrl) {
  logger.error('WEBHOOK_URL is required in production environment.');
  process.exit(1);
}

export default config;
