import dotenv from 'dotenv';
import { UserbotConfig } from './TelegramUserbot';

// Загружаем переменные окружения
dotenv.config();

/**
 * Создает конфигурацию userbot'а из переменных окружения
 */
export function createUserbotConfig(): UserbotConfig {
  const config: Partial<UserbotConfig> = {
    apiId: process.env.API_ID ? parseInt(process.env.API_ID) : undefined,
    apiHash: process.env.API_HASH,
    phoneNumber: process.env.PHONE_NUMBER,
    sessionName: process.env.SESSION_NAME || 'userbot_session',
    sessionPath: process.env.SESSION_PATH || './sessions',
  };

  // Проверяем обязательные поля
  const missingFields = [];
  if (!config.apiId) missingFields.push('API_ID');
  if (!config.apiHash) missingFields.push('API_HASH');
  if (!config.phoneNumber) missingFields.push('PHONE_NUMBER');

  if (missingFields.length > 0) {
    throw new Error(
      `Отсутствуют обязательные переменные окружения: ${missingFields.join(', ')}`,
    );
  }

  return config as UserbotConfig;
}

/**
 * Проверяет наличие всех необходимых переменных окружения
 */
export function validateEnvironmentVariables(): {
  valid: boolean;
  missing: string[];
} {
  const required = ['API_ID', 'API_HASH', 'PHONE_NUMBER'];
  const missing = required.filter((key) => !process.env[key]);

  return {
    valid: missing.length === 0,
    missing,
  };
}
