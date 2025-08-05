#!/usr/bin/env node

/**
 * Скрипт для тестирования подключения к Telegram API
 * Использовать для первичной настройки и проверки аутентификации
 */

import dotenv from 'dotenv';
import { TelegramUserbot } from './TelegramUserbot';
import { createUserbotConfig, validateEnvironmentVariables } from './config';
import { createLogger } from '../utils/logger';

// Загружаем переменные окружения
dotenv.config();

const logger = createLogger('TestConnection');

async function testConnection() {
  try {
    logger.info('🚀 Начинаем тестирование подключения к Telegram API...');

    // Проверяем переменные окружения
    const envValidation = validateEnvironmentVariables();
    if (!envValidation.valid) {
      logger.error(
        `❌ Отсутствуют переменные окружения: ${envValidation.missing.join(', ')}`,
      );
      logger.info('Убедитесь что в .env файле указаны:');
      logger.info('API_ID=ваш_api_id');
      logger.info('API_HASH=ваш_api_hash');
      logger.info('PHONE_NUMBER=+ваш_номер_телефона');
      process.exit(1);
    }

    // Создаем конфигурацию
    const config = createUserbotConfig();
    logger.info(`📱 Конфигурация загружена для номера: ${config.phoneNumber}`);

    // Создаем и подключаем userbot
    const userbot = new TelegramUserbot(config);

    logger.info('🔗 Подключение к Telegram...');
    await userbot.connect();

    logger.info('📋 Получение списка каналов...');
    const channels = await userbot.getChannels();

    logger.info(`✅ Найдено ${channels.length} каналов/групп:`);
    channels.slice(0, 10).forEach((channel, index) => {
      logger.info(
        `${index + 1}. ${channel.title} (${channel.type}) - ID: ${channel.id}`,
      );
    });

    if (channels.length > 10) {
      logger.info(`... и еще ${channels.length - 10} каналов`);
    }

    // Отключаемся
    await userbot.disconnect();
    logger.info('✅ Тест успешно завершен!');
  } catch (error) {
    logger.error('❌ Ошибка тестирования:', error);

    if (error instanceof Error) {
      if (error.message.includes('code')) {
        logger.info(
          '💡 Для первичной настройки может потребоваться код подтверждения',
        );
        logger.info(
          '💡 Запустите интерактивную настройку или введите код вручную',
        );
      }

      if (
        error.message.includes('API_ID') ||
        error.message.includes('API_HASH')
      ) {
        logger.info(
          '💡 Получите API_ID и API_HASH на https://my.telegram.org/auth',
        );
      }
    }

    process.exit(1);
  }
}

// Запускаем тест только если скрипт вызван напрямую
if (require.main === module) {
  testConnection().catch(console.error);
}

export { testConnection };
