/**
 * Тесты для NotificationSender
 */

import { NotificationSender } from '../../src/services/NotificationSender';
import { TelegramBotService } from '../../src/bot/TelegramBot';
import { UserService } from '../../src/services/UserService';
import { NotificationDAO } from '../../src/database/dao/NotificationDAO';
import {
  Notification,
  User,
  NotificationType,
} from '../../src/database/models';

// Мокаем зависимости
jest.mock('../../src/bot/TelegramBot');
jest.mock('../../src/services/UserService');
jest.mock('../../src/database/dao/NotificationDAO');

describe('NotificationSender', () => {
  let notificationSender: NotificationSender;
  let mockTelegramBot: jest.Mocked<TelegramBotService>;
  let mockUserService: jest.Mocked<UserService>;
  let mockNotificationDAO: jest.Mocked<NotificationDAO>;

  beforeEach(() => {
    mockTelegramBot = new TelegramBotService({
      token: 'test',
    }) as jest.Mocked<TelegramBotService>;
    mockUserService = new UserService() as jest.Mocked<UserService>;
    mockNotificationDAO = new NotificationDAO() as jest.Mocked<NotificationDAO>;

    notificationSender = new NotificationSender(mockTelegramBot);

    // Заменяем приватные зависимости мокам
    (notificationSender as any).userService = mockUserService;
    (notificationSender as any).notificationDAO = mockNotificationDAO;
  });

  const createTestNotification = (
    overrides: Partial<Notification> = {},
  ): Notification => ({
    notification_id: 1,
    user_id: 1,
    message_id: 1,
    notification_type: 'immediate' as NotificationType,
    title: 'Тестовое уведомление',
    content: 'Содержимое тестового уведомления',
    is_sent: false,
    created_at: new Date(),
    ...overrides,
  });

  const createTestUser = (overrides: Partial<User> = {}): User => ({
    user_id: 1,
    telegram_id: 123456789,
    username: 'testuser',
    first_name: 'Test',
    is_active: true,
    preferences: {
      notifications: true,
      digest_time: '09:00',
      categories: [],
      keywords: [],
      importance_threshold: 50,
    },
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  describe('initialize', () => {
    it('должен инициализировать с Telegram Bot', async () => {
      mockTelegramBot.initialize.mockResolvedValue();

      await notificationSender.initialize();

      expect(mockTelegramBot.initialize).toHaveBeenCalled();
    });

    it('должен обрабатывать ошибки инициализации', async () => {
      mockTelegramBot.initialize.mockRejectedValue(
        new Error('Bot init failed'),
      );

      await expect(notificationSender.initialize()).rejects.toThrow(
        'Bot init failed',
      );
    });
  });

  describe('sendNotification', () => {
    beforeEach(() => {
      mockTelegramBot.isReady.mockReturnValue(true);
      mockTelegramBot.isChatAccessible.mockResolvedValue(true);
    });

    it('должен отправить уведомление успешно', async () => {
      const notification = createTestNotification();
      const user = createTestUser();

      mockUserService.getUserById.mockResolvedValue({
        success: true,
        data: user,
      });

      mockTelegramBot.sendNotification.mockResolvedValue({
        success: true,
        messageId: 123,
      });

      mockNotificationDAO.markAsSent.mockResolvedValue({
        success: true,
        data: notification,
      });

      const result = await notificationSender.sendNotification(notification);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe(123);
      expect(mockTelegramBot.sendNotification).toHaveBeenCalledWith({
        chatId: user.telegram_id,
        title: notification.title,
        content: notification.content,
        options: {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          disable_notification: false,
        },
      });
      expect(mockNotificationDAO.markAsSent).toHaveBeenCalledWith(
        notification.notification_id,
      );
    });

    it('должен обрабатывать случай когда пользователь не найден', async () => {
      const notification = createTestNotification();

      mockUserService.getUserById.mockResolvedValue({
        success: false,
        error: 'User not found',
      });

      const result = await notificationSender.sendNotification(notification);

      expect(result.success).toBe(false);
      expect(result.error).toBe('User not found');
      expect(mockTelegramBot.sendNotification).not.toHaveBeenCalled();
    });

    it('должен обрабатывать случай когда уведомления отключены', async () => {
      const notification = createTestNotification();
      const user = createTestUser({
        preferences: {
          ...createTestUser().preferences,
          notifications: false,
        },
      });

      mockUserService.getUserById.mockResolvedValue({
        success: true,
        data: user,
      });

      const result = await notificationSender.sendNotification(notification);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Notifications disabled for user');
      expect(mockTelegramBot.sendNotification).not.toHaveBeenCalled();
    });

    it('должен обрабатывать недоступный чат', async () => {
      const notification = createTestNotification();
      const user = createTestUser();

      mockUserService.getUserById.mockResolvedValue({
        success: true,
        data: user,
      });

      mockTelegramBot.isChatAccessible.mockResolvedValue(false);

      const result = await notificationSender.sendNotification(notification);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Chat not accessible');
      expect(mockTelegramBot.sendNotification).not.toHaveBeenCalled();
    });

    it('должен обрабатывать ошибки отправки в Telegram', async () => {
      const notification = createTestNotification();
      const user = createTestUser();

      mockUserService.getUserById.mockResolvedValue({
        success: true,
        data: user,
      });

      mockTelegramBot.sendNotification.mockResolvedValue({
        success: false,
        error: 'Telegram API error',
      });

      const result = await notificationSender.sendNotification(notification);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Telegram API error');
      expect(mockNotificationDAO.markAsSent).not.toHaveBeenCalled();
    });

    it('должен работать без Telegram Bot', async () => {
      const notificationSenderWithoutBot = new NotificationSender();
      (notificationSenderWithoutBot as any).userService = mockUserService;
      (notificationSenderWithoutBot as any).notificationDAO =
        mockNotificationDAO;

      const notification = createTestNotification();
      const user = createTestUser();

      mockUserService.getUserById.mockResolvedValue({
        success: true,
        data: user,
      });

      const result =
        await notificationSenderWithoutBot.sendNotification(notification);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Telegram Bot not available');
    });
  });

  describe('sendBulkNotifications', () => {
    beforeEach(() => {
      mockTelegramBot.isReady.mockReturnValue(true);
      mockTelegramBot.isChatAccessible.mockResolvedValue(true);
    });

    it('должен отправить множественные уведомления', async () => {
      const notifications = [
        createTestNotification({ notification_id: 1, user_id: 1 }),
        createTestNotification({ notification_id: 2, user_id: 2 }),
        createTestNotification({ notification_id: 3, user_id: 1 }),
      ];

      const users = [
        createTestUser({ user_id: 1, telegram_id: 111 }),
        createTestUser({ user_id: 2, telegram_id: 222 }),
      ];

      mockUserService.getUserById
        .mockResolvedValueOnce({ success: true, data: users[0] })
        .mockResolvedValueOnce({ success: true, data: users[1] })
        .mockResolvedValueOnce({ success: true, data: users[0] });

      mockTelegramBot.sendNotification.mockResolvedValue({
        success: true,
        messageId: 123,
      });

      mockNotificationDAO.markAsSent.mockResolvedValue({
        success: true,
        data: notifications[0],
      });

      const result =
        await notificationSender.sendBulkNotifications(notifications);

      expect(result.total).toBe(3);
      expect(result.successful).toBe(3);
      expect(result.failed).toBe(0);
      expect(result.errors.length).toBe(0);
      expect(mockTelegramBot.sendNotification).toHaveBeenCalledTimes(3);
    });

    it('должен обрабатывать частичные неудачи', async () => {
      const notifications = [
        createTestNotification({ notification_id: 1, user_id: 1 }),
        createTestNotification({ notification_id: 2, user_id: 2 }),
      ];

      const user1 = createTestUser({ user_id: 1, telegram_id: 111 });

      mockUserService.getUserById
        .mockResolvedValueOnce({ success: true, data: user1 })
        .mockResolvedValueOnce({ success: false, error: 'User not found' });

      mockTelegramBot.sendNotification.mockResolvedValue({
        success: true,
        messageId: 123,
      });

      mockNotificationDAO.markAsSent.mockResolvedValue({
        success: true,
        data: notifications[0],
      });

      const result =
        await notificationSender.sendBulkNotifications(notifications);

      expect(result.total).toBe(2);
      expect(result.successful).toBe(1);
      expect(result.failed).toBe(1);
      expect(result.errors.length).toBe(1);
      expect(result.errors[0]).toContain('User 2: User not found');
    });

    it('должен группировать уведомления по пользователям', async () => {
      const notifications = [
        createTestNotification({ notification_id: 1, user_id: 1 }),
        createTestNotification({ notification_id: 2, user_id: 1 }),
        createTestNotification({ notification_id: 3, user_id: 2 }),
      ];

      const users = [
        createTestUser({ user_id: 1, telegram_id: 111 }),
        createTestUser({ user_id: 2, telegram_id: 222 }),
      ];

      mockUserService.getUserById
        .mockResolvedValueOnce({ success: true, data: users[0] })
        .mockResolvedValueOnce({ success: true, data: users[0] })
        .mockResolvedValueOnce({ success: true, data: users[1] });

      mockTelegramBot.sendNotification.mockResolvedValue({
        success: true,
        messageId: 123,
      });

      mockNotificationDAO.markAsSent.mockResolvedValue({
        success: true,
        data: notifications[0],
      });

      const result =
        await notificationSender.sendBulkNotifications(notifications);

      expect(result.successful).toBe(3);
      // Проверяем что были задержки между отправками (через spy на setTimeout)
      expect(mockTelegramBot.sendNotification).toHaveBeenCalledTimes(3);
    });
  });

  describe('sendPendingNotifications', () => {
    it('должен отправить неотправленные уведомления пользователя', async () => {
      const userId = 1;
      const pendingNotifications = [
        createTestNotification({ notification_id: 1, user_id: userId }),
        createTestNotification({ notification_id: 2, user_id: userId }),
      ];

      mockNotificationDAO.getPendingForUser.mockResolvedValue({
        success: true,
        data: pendingNotifications,
      });

      mockUserService.getUserById.mockResolvedValue({
        success: true,
        data: createTestUser({ user_id: userId }),
      });

      mockTelegramBot.isReady.mockReturnValue(true);
      mockTelegramBot.isChatAccessible.mockResolvedValue(true);
      mockTelegramBot.sendNotification.mockResolvedValue({
        success: true,
        messageId: 123,
      });

      mockNotificationDAO.markAsSent.mockResolvedValue({
        success: true,
        data: pendingNotifications[0],
      });

      const result = await notificationSender.sendPendingNotifications(userId);

      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(mockNotificationDAO.getPendingForUser).toHaveBeenCalledWith(
        userId,
      );
    });

    it('должен обрабатывать случай отсутствия неотправленных уведомлений', async () => {
      const userId = 1;

      mockNotificationDAO.getPendingForUser.mockResolvedValue({
        success: true,
        data: [],
      });

      const result = await notificationSender.sendPendingNotifications(userId);

      expect(result.total).toBe(0);
      expect(result.successful).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('sendAllPendingNotifications', () => {
    it('должен отправить все неотправленные уведомления', async () => {
      const pendingNotifications = [
        createTestNotification({ notification_id: 1, user_id: 1 }),
        createTestNotification({ notification_id: 2, user_id: 2 }),
      ];

      mockNotificationDAO.getAll.mockResolvedValue({
        success: true,
        data: {
          items: pendingNotifications,
          pagination: {
            page: 1,
            limit: 50,
            totalCount: 2,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        },
      });

      mockUserService.getUserById.mockResolvedValue({
        success: true,
        data: createTestUser(),
      });

      mockTelegramBot.isReady.mockReturnValue(true);
      mockTelegramBot.isChatAccessible.mockResolvedValue(true);
      mockTelegramBot.sendNotification.mockResolvedValue({
        success: true,
        messageId: 123,
      });

      mockNotificationDAO.markAsSent.mockResolvedValue({
        success: true,
        data: pendingNotifications[0],
      });

      const result = await notificationSender.sendAllPendingNotifications();

      expect(result.total).toBe(2);
      expect(result.successful).toBe(2);
      expect(mockNotificationDAO.getAll).toHaveBeenCalledWith({
        is_sent: false,
      });
    });
  });

  describe('checkChannelHealth', () => {
    it('должен проверить состояние Telegram канала', async () => {
      mockTelegramBot.isReady.mockReturnValue(true);
      mockTelegramBot.getBotInstance.mockReturnValue({
        getMe: jest.fn().mockResolvedValue({ id: 123, username: 'testbot' }),
      } as any);

      const health = await notificationSender.checkChannelHealth();

      expect(health.telegram).toBe(true);
      expect(health.overall).toBe(true);
    });

    it('должен обрабатывать недоступность Telegram', async () => {
      mockTelegramBot.isReady.mockReturnValue(false);

      const health = await notificationSender.checkChannelHealth();

      expect(health.telegram).toBe(false);
      expect(health.overall).toBe(false);
    });

    it('должен обрабатывать ошибки API Telegram', async () => {
      mockTelegramBot.isReady.mockReturnValue(true);
      mockTelegramBot.getBotInstance.mockReturnValue({
        getMe: jest.fn().mockRejectedValue(new Error('API Error')),
      } as any);

      const health = await notificationSender.checkChannelHealth();

      expect(health.telegram).toBe(false);
      expect(health.overall).toBe(false);
    });
  });

  describe('getDeliveryStats', () => {
    it('должен получить статистику доставки для пользователя', async () => {
      const userId = 1;
      const mockStats = {
        total: 10,
        sent: 8,
        pending: 2,
        byType: {
          immediate: 5,
          digest: 5,
        },
      };

      mockNotificationDAO.getStatsByUser.mockResolvedValue({
        success: true,
        data: mockStats,
      });

      const result = await notificationSender.getDeliveryStats(userId);

      expect(result.total).toBe(10);
      expect(result.sent).toBe(8);
      expect(result.pending).toBe(2);
      expect(result.failed).toBe(0);
      expect(mockNotificationDAO.getStatsByUser).toHaveBeenCalledWith(userId);
    });

    it('должен возвращать нулевую статистику при ошибках', async () => {
      mockNotificationDAO.getStatsByUser.mockResolvedValue({
        success: false,
        error: 'Database error',
      });

      const result = await notificationSender.getDeliveryStats(1);

      expect(result.total).toBe(0);
      expect(result.sent).toBe(0);
      expect(result.pending).toBe(0);
      expect(result.failed).toBe(0);
    });
  });

  describe('stop', () => {
    it('должен корректно останавливать сервис', async () => {
      mockTelegramBot.stop.mockResolvedValue();

      await notificationSender.stop();

      expect(mockTelegramBot.stop).toHaveBeenCalled();
    });

    it('должен обрабатывать ошибки остановки', async () => {
      mockTelegramBot.stop.mockRejectedValue(new Error('Stop error'));

      await expect(notificationSender.stop()).resolves.not.toThrow();
    });
  });
});
