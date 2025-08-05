/**
 * Тесты для NotificationService
 */

import { NotificationService } from '../../src/services/NotificationService';
import { AIAnalysisService } from '../../src/ai/AIAnalysisService';
import { UserService } from '../../src/services/UserService';
import { NotificationDAO } from '../../src/database/dao/NotificationDAO';
import {
  Message,
  User,
  CreateNotificationData,
  NotificationType,
} from '../../src/database/models';

// Мокаем зависимости
jest.mock('../../src/ai/AIAnalysisService');
jest.mock('../../src/services/UserService');
jest.mock('../../src/database/dao/NotificationDAO');

describe('NotificationService', () => {
  let notificationService: NotificationService;
  let mockAIService: jest.Mocked<AIAnalysisService>;
  let mockUserService: jest.Mocked<UserService>;
  let mockNotificationDAO: jest.Mocked<NotificationDAO>;

  beforeEach(() => {
    mockAIService = new AIAnalysisService({
      openaiApiKey: 'test-key',
    }) as jest.Mocked<AIAnalysisService>;

    mockUserService = new UserService() as jest.Mocked<UserService>;
    mockNotificationDAO = new NotificationDAO() as jest.Mocked<NotificationDAO>;

    notificationService = new NotificationService(mockAIService);

    // Заменяем приватные зависимости мокам (хак для тестирования)
    (notificationService as any).userService = mockUserService;
    (notificationService as any).notificationDAO = mockNotificationDAO;
  });

  const createTestMessage = (overrides: Partial<Message> = {}): Message => ({
    message_id: 1,
    telegram_message_id: BigInt(123),
    channel_id: 1,
    content: 'Тестовое сообщение',
    media_type: 'text',
    is_filtered: true,
    is_processed: true,
    importance_score: 50,
    created_at: new Date(),
    updated_at: new Date(),
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
      quiet_hours: {
        start: '22:00',
        end: '08:00',
      },
    },
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  describe('analyzeForImmedateNotification', () => {
    it('должен анализировать критичность сообщения', async () => {
      const message = createTestMessage({
        importance_score: 90,
        content: 'СРОЧНО! Произошла авария',
      });

      const result =
        await notificationService.analyzeForImmedateNotification(message);

      expect(result.is_critical).toBe(true);
      expect(result.criticality_score).toBeGreaterThan(80);
      expect(result.factors.critical_keywords.length).toBeGreaterThan(0);
    });

    it('должен обрабатывать ошибки корректно', async () => {
      const message = createTestMessage({
        content: null as any,
      });

      const result =
        await notificationService.analyzeForImmedateNotification(message);

      expect(result.is_critical).toBe(false);
      expect(result.criticality_score).toBe(0);
      expect(result.reasons).toContain('Analysis failed');
    });
  });

  describe('shouldNotifyUser', () => {
    const createCriticalAnalysis = () => ({
      is_critical: true,
      criticality_score: 85,
      confidence: 0.9,
      factors: {
        importance_score: 85,
        critical_keywords: ['срочно'],
        urgency_markers: [],
        critical_category: true,
        breaking_news: false,
        time_sensitivity: 'urgent' as const,
      },
      reasons: ['High importance score'],
      recommended_action: 'immediate_notification' as const,
    });

    it('должен разрешить уведомление для критического сообщения', async () => {
      const user = createTestUser();
      const analysis = createCriticalAnalysis();

      const result = await notificationService.shouldNotifyUser(user, analysis);

      expect(result.shouldNotify).toBe(true);
      expect(result.reason).toContain('Critical message');
    });

    it('должен запретить уведомление если уведомления отключены', async () => {
      const user = createTestUser({
        preferences: {
          ...createTestUser().preferences,
          notifications: false,
        },
      });
      const analysis = createCriticalAnalysis();

      const result = await notificationService.shouldNotifyUser(user, analysis);

      expect(result.shouldNotify).toBe(false);
      expect(result.reason).toBe('User has notifications disabled');
    });

    it('должен запретить уведомление если балл ниже порога пользователя', async () => {
      const user = createTestUser({
        preferences: {
          ...createTestUser().preferences,
          importance_threshold: 90,
        },
      });
      const analysis = createCriticalAnalysis();
      analysis.criticality_score = 80;

      const result = await notificationService.shouldNotifyUser(user, analysis);

      expect(result.shouldNotify).toBe(false);
      expect(result.reason).toContain('below user threshold');
    });

    it('должен запретить уведомление если сообщение не критичное', async () => {
      const user = createTestUser();
      const analysis = createCriticalAnalysis();
      analysis.is_critical = false;

      const result = await notificationService.shouldNotifyUser(user, analysis);

      expect(result.shouldNotify).toBe(false);
      expect(result.reason).toBe('Message is not critical');
    });

    it('должен учитывать тихие часы', async () => {
      // Мокаем время как 23:00 (тихие часы)
      const mockDate = new Date();
      mockDate.setHours(23, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const user = createTestUser();
      const analysis = createCriticalAnalysis();
      analysis.criticality_score = 85; // Не достаточно критично для прохождения тихих часов

      const result = await notificationService.shouldNotifyUser(user, analysis);

      expect(result.shouldNotify).toBe(false);
      expect(result.reason).toContain('quiet hours');

      jest.restoreAllMocks();
    });

    it('должен пропускать очень критичные новости через тихие часы', async () => {
      // Мокаем время как 23:00 (тихие часы)
      const mockDate = new Date();
      mockDate.setHours(23, 0, 0, 0);
      jest.spyOn(global, 'Date').mockImplementation(() => mockDate as any);

      const user = createTestUser();
      const analysis = createCriticalAnalysis();
      analysis.criticality_score = 95; // Очень критично

      const result = await notificationService.shouldNotifyUser(user, analysis);

      expect(result.shouldNotify).toBe(true);
      expect(result.reason).toContain('Critical message');

      jest.restoreAllMocks();
    });
  });

  describe('createNotification', () => {
    it('должен создать уведомление', async () => {
      const notificationData: CreateNotificationData = {
        user_id: 1,
        message_id: 1,
        notification_type: 'immediate',
        title: 'Тест',
        content: 'Тестовое уведомление',
      };

      const mockNotification = {
        notification_id: 1,
        ...notificationData,
        is_sent: false,
        created_at: new Date(),
      };

      mockNotificationDAO.create.mockResolvedValue({
        success: true,
        data: mockNotification,
      });

      const result =
        await notificationService.createNotification(notificationData);

      expect(result.success).toBe(true);
      expect(result.data).toEqual(mockNotification);
      expect(mockNotificationDAO.create).toHaveBeenCalledWith(notificationData);
    });

    it('должен обрабатывать ошибки создания', async () => {
      mockNotificationDAO.create.mockResolvedValue({
        success: false,
        error: 'Database error',
      });

      const result = await notificationService.createNotification({
        user_id: 1,
        notification_type: 'immediate',
        content: 'Test',
      });

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to create notification');
    });
  });

  describe('processMessageForNotifications', () => {
    it('должен обработать критическое сообщение и создать уведомления', async () => {
      const message = createTestMessage({
        importance_score: 90,
        content: 'СРОЧНО! Важная новость',
      });

      const users = [
        createTestUser({ user_id: 1, telegram_id: 111 }),
        createTestUser({ user_id: 2, telegram_id: 222 }),
      ];

      const mockNotifications = [
        {
          notification_id: 1,
          user_id: 1,
          message_id: 1,
          notification_type: 'immediate' as NotificationType,
          title: '🚨 Критически важная новость',
          content: 'СРОЧНО! Важная новость',
          is_sent: false,
          created_at: new Date(),
        },
        {
          notification_id: 2,
          user_id: 2,
          message_id: 1,
          notification_type: 'immediate' as NotificationType,
          title: '🚨 Критически важная новость',
          content: 'СРОЧНО! Важная новость',
          is_sent: false,
          created_at: new Date(),
        },
      ];

      mockUserService.getAllUsers.mockResolvedValue({
        success: true,
        data: users,
      });

      mockNotificationDAO.create
        .mockResolvedValueOnce({ success: true, data: mockNotifications[0] })
        .mockResolvedValueOnce({ success: true, data: mockNotifications[1] });

      const result =
        await notificationService.processMessageForNotifications(message);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(2);
      expect(mockNotificationDAO.create).toHaveBeenCalledTimes(2);
    });

    it('должен пропустить некритическое сообщение', async () => {
      const message = createTestMessage({
        importance_score: 30,
        content: 'Обычная новость',
      });

      const result =
        await notificationService.processMessageForNotifications(message);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(0);
      expect(mockUserService.getAllUsers).not.toHaveBeenCalled();
    });

    it('должен обрабатывать ошибки получения пользователей', async () => {
      const message = createTestMessage({
        importance_score: 90,
        content: 'СРОЧНО! Важная новость',
      });

      mockUserService.getAllUsers.mockResolvedValue({
        success: false,
        error: 'Database error',
      });

      const result =
        await notificationService.processMessageForNotifications(message);

      expect(result.success).toBe(false);
      expect(result.error).toBe('Failed to get users');
    });

    it('должен пропускать неактивных пользователей', async () => {
      const message = createTestMessage({
        importance_score: 90,
        content: 'СРОЧНО! Важная новость',
      });

      const users = [
        createTestUser({ user_id: 1, is_active: true }),
        createTestUser({ user_id: 2, is_active: false }),
      ];

      mockUserService.getAllUsers.mockResolvedValue({
        success: true,
        data: users,
      });

      mockNotificationDAO.create.mockResolvedValue({
        success: true,
        data: {
          notification_id: 1,
          user_id: 1,
          message_id: 1,
          notification_type: 'immediate' as NotificationType,
          content: 'Test',
          is_sent: false,
          created_at: new Date(),
        },
      });

      const result =
        await notificationService.processMessageForNotifications(message);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(mockNotificationDAO.create).toHaveBeenCalledTimes(1);
    });
  });

  describe('getUserNotifications', () => {
    it('должен получить уведомления пользователя', async () => {
      const userId = 1;
      const mockResult = {
        success: true,
        data: {
          items: [
            {
              notification_id: 1,
              user_id: userId,
              content: 'Test notification',
              is_sent: false,
              created_at: new Date(),
            },
          ],
          pagination: {
            page: 1,
            limit: 50,
            totalCount: 1,
            totalPages: 1,
            hasNext: false,
            hasPrev: false,
          },
        },
      };

      mockNotificationDAO.getAll.mockResolvedValue(mockResult);

      const result = await notificationService.getUserNotifications(userId);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(mockNotificationDAO.getAll).toHaveBeenCalledWith({
        user_id: userId,
      });
    });
  });

  describe('getPendingNotifications', () => {
    it('должен получить неотправленные уведомления', async () => {
      const userId = 1;
      const mockNotifications = [
        {
          notification_id: 1,
          user_id: userId,
          content: 'Pending notification',
          is_sent: false,
          created_at: new Date(),
        },
      ];

      mockNotificationDAO.getPendingForUser.mockResolvedValue({
        success: true,
        data: mockNotifications,
      });

      const result = await notificationService.getPendingNotifications(userId);

      expect(result.success).toBe(true);
      expect(result.data?.length).toBe(1);
      expect(mockNotificationDAO.getPendingForUser).toHaveBeenCalledWith(
        userId,
      );
    });
  });

  describe('markNotificationAsSent', () => {
    it('должен отметить уведомление как отправленное', async () => {
      const notificationId = 1;
      const mockNotification = {
        notification_id: notificationId,
        user_id: 1,
        content: 'Test',
        is_sent: true,
        sent_at: new Date(),
        created_at: new Date(),
      };

      mockNotificationDAO.markAsSent.mockResolvedValue({
        success: true,
        data: mockNotification,
      });

      const result =
        await notificationService.markNotificationAsSent(notificationId);

      expect(result.success).toBe(true);
      expect(result.data?.is_sent).toBe(true);
      expect(mockNotificationDAO.markAsSent).toHaveBeenCalledWith(
        notificationId,
      );
    });
  });

  describe('generateNotificationTitle', () => {
    it('должен генерировать заголовки в зависимости от балла критичности', async () => {
      const testCases = [
        { score: 95, expectedIcon: '🚨' },
        { score: 85, expectedIcon: '⚠️' },
        { score: 75, expectedIcon: '📢' },
      ];

      for (const testCase of testCases) {
        const message = createTestMessage({
          importance_score: testCase.score,
          content: 'СРОЧНО! Тест',
        });

        const result =
          await notificationService.analyzeForImmedateNotification(message);

        // Мы не можем напрямую протестировать приватный метод,
        // но можем проверить, что заголовок генерируется корректно
        // через создание уведомления
        if (result.is_critical) {
          const users = [createTestUser()];
          mockUserService.getAllUsers.mockResolvedValue({
            success: true,
            data: users,
          });

          mockNotificationDAO.create.mockResolvedValue({
            success: true,
            data: {
              notification_id: 1,
              user_id: 1,
              message_id: 1,
              notification_type: 'immediate' as NotificationType,
              title: `${testCase.expectedIcon} Критически важная новость`,
              content: 'СРОЧНО! Тест',
              is_sent: false,
              created_at: new Date(),
            },
          });

          await notificationService.processMessageForNotifications(message);

          const createCall = mockNotificationDAO.create.mock.calls[0][0];
          expect(createCall.title).toContain(testCase.expectedIcon);
        }
      }
    });
  });
});
