/**
 * Интеграционные тесты для MessageProcessingPipeline
 */

import { MessageProcessingPipeline } from '../../src/services/MessageProcessingPipeline';
import { TelegramBotService } from '../../src/bot/TelegramBot';
import { AIAnalysisService } from '../../src/ai/AIAnalysisService';
import { Message, Channel, User } from '../../src/database/models';
import { db } from '../../src/database/connection';

// Мокаем только внешние зависимости
jest.mock('../../src/bot/TelegramBot');
jest.mock('../../src/ai/AIAnalysisService');

describe('MessageProcessingPipeline Integration', () => {
  let pipeline: MessageProcessingPipeline;
  let mockTelegramBot: jest.Mocked<TelegramBotService>;
  let mockAIService: jest.Mocked<AIAnalysisService>;

  beforeAll(async () => {
    // Создаем мок сервисы
    mockTelegramBot = new TelegramBotService({
      token: 'test',
    }) as jest.Mocked<TelegramBotService>;
    mockAIService = new AIAnalysisService({
      openaiApiKey: 'test',
    }) as jest.Mocked<AIAnalysisService>;

    // Мокаем методы
    mockTelegramBot.initialize.mockResolvedValue();
    mockTelegramBot.isReady.mockReturnValue(true);
    mockTelegramBot.isChatAccessible.mockResolvedValue(true);
    mockTelegramBot.sendNotification.mockResolvedValue({
      success: true,
      messageId: 123,
    });

    mockAIService.analyzeContent.mockResolvedValue({
      importance: {
        score: 85,
        reasoning: 'High importance test',
        factors: ['test factor'],
      },
      category: {
        category: 'breaking_news',
        confidence: 0.9,
        keywords: ['test'],
      },
      sentiment: 'neutral',
      keywords: ['test'],
      isSpam: false,
      isAd: false,
    });

    pipeline = new MessageProcessingPipeline(mockAIService, mockTelegramBot, {
      enableFiltering: true,
      enableAIAnalysis: true,
      enableNotifications: true,
      enableAutoSending: true,
      batchSize: 5,
      processingDelay: 100,
    });

    await pipeline.initialize();
  });

  beforeEach(async () => {
    // Очищаем таблицы перед каждым тестом
    await db.query('DELETE FROM notifications');
    await db.query('DELETE FROM messages');
    await db.query('DELETE FROM channels');
    await db.query('DELETE FROM users');

    // Создаем тестового пользователя
    await db.query(
      `
      INSERT INTO users (telegram_id, username, first_name, is_active, preferences)
      VALUES (123456789, 'testuser', 'Test', true, $1)
    `,
      [
        JSON.stringify({
          notifications: true,
          digest_time: '09:00',
          categories: [],
          keywords: [],
          importance_threshold: 50,
        }),
      ],
    );

    // Создаем тестовый канал
    await db.query(`
      INSERT INTO channels (telegram_channel_id, channel_name, channel_title, is_active)
      VALUES (987654321, 'testchannel', 'Test Channel', true)
    `);
  });

  afterAll(async () => {
    await pipeline.stop();

    // Очищаем после всех тестов
    await db.query('DELETE FROM notifications');
    await db.query('DELETE FROM messages');
    await db.query('DELETE FROM channels');
    await db.query('DELETE FROM users');
  });

  const createTestMessage = async (
    overrides: Partial<Message> = {},
  ): Promise<Message> => {
    const channelResult = await db.query(
      'SELECT channel_id FROM channels LIMIT 1',
    );
    const channelId = channelResult.rows[0].channel_id;

    const messageData = {
      telegram_message_id: BigInt(Math.floor(Math.random() * 1000000)),
      channel_id: channelId,
      content: 'Тестовое сообщение',
      media_type: 'text',
      is_filtered: false,
      is_processed: false,
      importance_score: 50,
      ...overrides,
    };

    const result = await db.query(
      `
      INSERT INTO messages (
        telegram_message_id, channel_id, content, media_type, 
        is_filtered, is_processed, importance_score
      )
      VALUES ($1, $2, $3, $4, $5, $6, $7)
      RETURNING *
    `,
      [
        messageData.telegram_message_id,
        messageData.channel_id,
        messageData.content,
        messageData.media_type,
        messageData.is_filtered,
        messageData.is_processed,
        messageData.importance_score,
      ],
    );

    return result.rows[0];
  };

  const getChannelInfo = async (): Promise<Channel> => {
    const result = await db.query('SELECT * FROM channels LIMIT 1');
    return result.rows[0];
  };

  describe('processSingleMessage', () => {
    it('должен обработать обычное сообщение через весь pipeline', async () => {
      const message = await createTestMessage({
        content: 'Обычная новость дня',
        importance_score: 60,
      });

      const channel = await getChannelInfo();
      const result = await pipeline.processSingleMessage(message, channel);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe(message.message_id);
      expect(result.filtered).toBe(true); // Прошло фильтрацию
      expect(result.analyzed).toBe(true); // Прошло ИИ анализ
      expect(result.notificationsCreated).toBe(0); // Не критичное, уведомления не созданы
      expect(result.notificationsSent).toBe(0);

      // Проверяем что сообщение обновлено в БД
      const updatedMessage = await db.query(
        'SELECT * FROM messages WHERE message_id = $1',
        [message.message_id],
      );

      expect(updatedMessage.rows[0].is_filtered).toBe(true);
      expect(updatedMessage.rows[0].is_processed).toBe(true);
      expect(updatedMessage.rows[0].importance_score).toBeGreaterThan(60);
    });

    it('должен обработать критическое сообщение и создать уведомления', async () => {
      const message = await createTestMessage({
        content: 'СРОЧНО! Произошла серьезная авария',
        importance_score: 90,
      });

      const channel = await getChannelInfo();
      const result = await pipeline.processSingleMessage(message, channel);

      expect(result.success).toBe(true);
      expect(result.filtered).toBe(true);
      expect(result.analyzed).toBe(true);
      expect(result.notificationsCreated).toBe(1); // Создано уведомление
      expect(result.notificationsSent).toBe(1); // Отправлено уведомление

      // Проверяем что уведомление создано в БД
      const notifications = await db.query(
        'SELECT * FROM notifications WHERE message_id = $1',
        [message.message_id],
      );

      expect(notifications.rows.length).toBe(1);
      expect(notifications.rows[0].notification_type).toBe('immediate');
      expect(notifications.rows[0].is_sent).toBe(true);

      // Проверяем что был вызов Telegram API
      expect(mockTelegramBot.sendNotification).toHaveBeenCalled();
    });

    it('должен блокировать спам и не обрабатывать дальше', async () => {
      const message = await createTestMessage({
        content: 'РЕКЛАМА!!! Купите наш товар со скидкой 90%! Звоните сейчас!',
        importance_score: 30,
      });

      const channel = await getChannelInfo();
      const result = await pipeline.processSingleMessage(message, channel);

      expect(result.success).toBe(true);
      expect(result.filtered).toBe(false); // Заблокировано фильтром
      expect(result.analyzed).toBe(false); // ИИ анализ не запущен
      expect(result.notificationsCreated).toBe(0);
      expect(result.notificationsSent).toBe(0);

      // Проверяем что сообщение отмечено как заблокированное
      const updatedMessage = await db.query(
        'SELECT * FROM messages WHERE message_id = $1',
        [message.message_id],
      );

      expect(updatedMessage.rows[0].is_filtered).toBe(false); // false означает заблокировано
      expect(updatedMessage.rows[0].is_processed).toBe(false);
    });

    it('должен обрабатывать ошибки ИИ анализа', async () => {
      // Мокаем ошибку ИИ
      mockAIService.analyzeContent.mockRejectedValueOnce(
        new Error('AI service error'),
      );

      const message = await createTestMessage({
        content: 'Сообщение для теста ошибки ИИ',
      });

      const channel = await getChannelInfo();
      const result = await pipeline.processSingleMessage(message, channel);

      expect(result.success).toBe(true);
      expect(result.filtered).toBe(true);
      expect(result.analyzed).toBe(false); // ИИ анализ не удался
      expect(result.notificationsCreated).toBe(0);
    });

    it('должен работать с отключенными компонентами', async () => {
      // Создаем pipeline с отключенными компонентами
      const limitedPipeline = new MessageProcessingPipeline(
        undefined,
        undefined,
        {
          enableFiltering: false,
          enableAIAnalysis: false,
          enableNotifications: false,
          enableAutoSending: false,
        },
      );

      await limitedPipeline.initialize();

      const message = await createTestMessage({
        content: 'СРОЧНО! Критическое сообщение',
      });

      const channel = await getChannelInfo();
      const result = await limitedPipeline.processSingleMessage(
        message,
        channel,
      );

      expect(result.success).toBe(true);
      expect(result.filtered).toBe(false); // Фильтрация отключена
      expect(result.analyzed).toBe(false); // ИИ анализ отключен
      expect(result.notificationsCreated).toBe(0); // Уведомления отключены

      await limitedPipeline.stop();
    });
  });

  describe('processBatch', () => {
    it('должен обработать пакет сообщений', async () => {
      const messages = await Promise.all([
        createTestMessage({ content: 'Сообщение 1', importance_score: 30 }),
        createTestMessage({
          content: 'СРОЧНО! Сообщение 2',
          importance_score: 90,
        }),
        createTestMessage({ content: 'Сообщение 3', importance_score: 50 }),
      ]);

      const channel = await getChannelInfo();
      const channels = new Map([[channel.channel_id, channel]]);

      const stats = await pipeline.processBatch(messages, channels);

      expect(stats.processed).toBe(3);
      expect(stats.filtered).toBe(3); // Все прошли фильтрацию
      expect(stats.analyzed).toBe(3); // Все прошли ИИ анализ
      expect(stats.notificationsCreated).toBe(1); // Только одно критичное
      expect(stats.notificationsSent).toBe(1);
      expect(stats.errors).toBe(0);
      expect(stats.processingTime).toBeGreaterThan(0);
    });

    it('должен обрабатывать ошибки в пакете', async () => {
      const messages = await Promise.all([
        createTestMessage({ content: 'Нормальное сообщение' }),
        // Создаем некорректное сообщение (будет ошибка в БД)
        {
          message_id: 99999,
          telegram_message_id: BigInt(99999),
          channel_id: 99999, // Несуществующий канал
          content: 'Ошибочное сообщение',
          media_type: 'text',
          is_filtered: false,
          is_processed: false,
          importance_score: 50,
          created_at: new Date(),
          updated_at: new Date(),
        } as Message,
      ]);

      const stats = await pipeline.processBatch(messages);

      expect(stats.processed).toBe(2);
      expect(stats.errors).toBeGreaterThan(0); // Есть ошибки
    });

    it('должен предотвращать параллельную обработку', async () => {
      const messages = [await createTestMessage()];

      // Запускаем два пакета одновременно
      const [stats1, stats2] = await Promise.all([
        pipeline.processBatch(messages),
        pipeline.processBatch(messages),
      ]);

      // Только один должен обработаться
      const totalProcessed = stats1.processed + stats2.processed;
      expect(totalProcessed).toBe(1);
    });
  });

  describe('sendAllPendingNotifications', () => {
    it('должен отправить все неотправленные уведомления', async () => {
      // Создаем уведомления вручную
      const userResult = await db.query('SELECT user_id FROM users LIMIT 1');
      const userId = userResult.rows[0].user_id;

      const message = await createTestMessage({
        content: 'СРОЧНО! Тестовое уведомление',
      });

      await db.query(
        `
        INSERT INTO notifications (
          user_id, message_id, notification_type, title, content, is_sent
        )
        VALUES ($1, $2, $3, $4, $5, $6)
      `,
        [userId, message.message_id, 'immediate', 'Тест', 'Содержимое', false],
      );

      const result = await pipeline.sendAllPendingNotifications();

      expect(result.total).toBe(1);
      expect(result.sent).toBe(1);
      expect(result.failed).toBe(0);

      // Проверяем что уведомление отмечено как отправленное
      const updatedNotification = await db.query(
        'SELECT is_sent FROM notifications WHERE message_id = $1',
        [message.message_id],
      );

      expect(updatedNotification.rows[0].is_sent).toBe(true);
    });
  });

  describe('getStats', () => {
    it('должен возвращать статистику pipeline', async () => {
      const stats = await pipeline.getStats();

      expect(stats.pipeline).toBeDefined();
      expect(stats.pipeline.enableFiltering).toBe(true);
      expect(stats.pipeline.enableAIAnalysis).toBe(true);
      expect(stats.pipeline.enableNotifications).toBe(true);

      expect(stats.health).toBeDefined();
      expect(stats.health.contentFilter).toBe(true);
      expect(stats.health.aiProcessor).toBe(true);
      expect(stats.health.notificationService).toBe(true);
      expect(stats.health.notificationSender).toBe(true); // Мокнутый как working
    });
  });

  describe('updateConfig', () => {
    it('должен обновлять конфигурацию pipeline', () => {
      const newConfig = {
        enableFiltering: false,
        batchSize: 20,
      };

      pipeline.updateConfig(newConfig);

      expect(pipeline.isCurrentlyProcessing()).toBe(false);

      // Проверяем что конфигурация обновилась через getStats
      const stats = pipeline.getStats();
      expect(stats.pipeline.enableFiltering).toBe(false);
      expect(stats.pipeline.batchSize).toBe(20);
    });
  });

  describe('real world scenarios', () => {
    it('должен обрабатывать смешанный поток сообщений', async () => {
      const messages = await Promise.all([
        // Обычная новость
        createTestMessage({
          content: 'Обычная новость: в городе открылся новый парк',
          importance_score: 40,
        }),
        // Спам
        createTestMessage({
          content: 'РЕКЛАМА! Купите наш товар! Скидка 90%!',
          importance_score: 20,
        }),
        // Критическая новость
        createTestMessage({
          content: 'СРОЧНО! Землетрясение магнитудой 6.5 произошло в регионе',
          importance_score: 95,
        }),
        // Важная, но не критическая
        createTestMessage({
          content: 'Важно: изменения в законодательстве вступают в силу',
          importance_score: 75,
        }),
      ]);

      const channel = await getChannelInfo();
      const channels = new Map([[channel.channel_id, channel]]);

      const stats = await pipeline.processBatch(messages, channels);

      expect(stats.processed).toBe(4);
      expect(stats.filtered).toBe(3); // Спам заблокирован
      expect(stats.analyzed).toBe(3); // 3 прошли ИИ анализ
      expect(stats.notificationsCreated).toBe(1); // Только критическое
      expect(stats.notificationsSent).toBe(1);
      expect(stats.errors).toBe(0);

      // Проверяем конкретные результаты
      const finalMessages = await db.query(
        `
        SELECT message_id, content, is_filtered, is_processed, importance_score
        FROM messages 
        WHERE message_id = ANY($1)
        ORDER BY message_id
      `,
        [messages.map((m) => m.message_id)],
      );

      expect(finalMessages.rows[0].is_filtered).toBe(true); // Обычная новость
      expect(finalMessages.rows[1].is_filtered).toBe(false); // Спам заблокирован
      expect(finalMessages.rows[2].is_filtered).toBe(true); // Критическая новость
      expect(finalMessages.rows[3].is_filtered).toBe(true); // Важная новость

      // Проверяем уведомления
      const notifications = await db.query(
        'SELECT * FROM notifications WHERE message_id = ANY($1)',
        [messages.map((m) => m.message_id)],
      );

      expect(notifications.rows.length).toBe(1); // Только для критической новости
      expect(notifications.rows[0].notification_type).toBe('immediate');
    });
  });
});
