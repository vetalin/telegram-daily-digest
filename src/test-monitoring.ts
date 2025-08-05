/**
 * Тестовый скрипт для проверки функционала мониторинга каналов
 */

import { userbotService } from './services/UserbotService';
import { db } from './database/connection';
import { channelDAO, messageDAO } from './database/dao';
import { createLogger } from './utils/logger';

const logger = createLogger('TestMonitoring');

async function testMonitoring() {
  try {
    logger.info('🚀 Запуск теста мониторинга каналов...');

    // 1. Подключение к базе данных
    logger.info('📊 Подключение к базе данных...');
    await db.connect();

    // 2. Проверка конфигурации userbot
    logger.info('⚙️ Проверка конфигурации userbot...');
    const configValidation = userbotService.validateConfiguration();

    if (!configValidation.valid) {
      logger.error(
        '❌ Конфигурация userbot некорректна:',
        configValidation.errors,
      );
      return;
    }

    logger.info('✅ Конфигурация userbot корректна');

    // 3. Инициализация userbot (если переменные окружения настроены)
    if (
      process.env.API_ID &&
      process.env.API_HASH &&
      process.env.PHONE_NUMBER
    ) {
      logger.info('🔐 Инициализация userbot...');

      try {
        await userbotService.initializeWithMonitoring();
        logger.info('✅ Userbot инициализирован и мониторинг запущен');

        // Показываем статус мониторинга
        const status = userbotService.getMonitoringStatus();
        logger.info('📊 Статус мониторинга:', status);

        // Пример добавления канала (раскомментируйте для тестирования)
        // await userbotService.addChannelToMonitoring('@test_channel');
      } catch (error) {
        logger.warn(
          '⚠️ Не удалось инициализировать userbot (возможно, требуется интерактивная настройка):',
          error,
        );
      }
    } else {
      logger.info(
        '⚠️ Переменные окружения для userbot не настроены, пропускаем инициализацию',
      );
    }

    // 4. Тестирование DAO функций
    logger.info('🧪 Тестирование DAO функций...');

    // Тест ChannelDAO
    const testChannel = await channelDAO.createOrGet({
      telegram_channel_id: -1001234567890,
      channel_name: 'Тестовый канал',
      channel_username: 'test_channel',
      description: 'Канал для тестирования мониторинга',
    });

    if (testChannel.success) {
      logger.info('✅ Тест канала пройден:', testChannel.data?.channel_name);
    }

    // Тест MessageDAO
    if (testChannel.success && testChannel.data) {
      const testMessage = await messageDAO.create({
        telegram_message_id: 12345,
        channel_id: testChannel.data.channel_id,
        content: 'Тестовое сообщение для проверки системы мониторинга',
        media_type: 'text',
      });

      if (testMessage.success) {
        logger.info(
          '✅ Тест сообщения пройден:',
          testMessage.data?.content.substring(0, 50) + '...',
        );
      }
    }

    // 5. Получение статистики
    const stats = await messageDAO.getStatistics();
    if (stats.success) {
      logger.info('📈 Статистика сообщений:', stats.data);
    }

    const channels = await channelDAO.getActiveChannels();
    if (channels.data) {
      logger.info(`📺 Активных каналов: ${channels.data.length}`);
    }

    logger.info('🎉 Тест мониторинга завершен успешно!');
  } catch (error) {
    logger.error('❌ Ошибка во время теста:', error);
  } finally {
    // Отключение от БД
    await db.disconnect();

    // Остановка userbot
    try {
      await userbotService.shutdown();
    } catch (error) {
      // Игнорируем ошибки отключения
    }

    process.exit(0);
  }
}

// Запуск теста, если файл вызван напрямую
if (require.main === module) {
  testMonitoring().catch((error) => {
    logger.error('Критическая ошибка теста:', error);
    process.exit(1);
  });
}

export { testMonitoring };
