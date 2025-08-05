/**
 * NotificationSender - сервис для отправки уведомлений через различные каналы
 */

import {
  TelegramBotService,
  NotificationMessage,
  SendResult,
} from '../bot/TelegramBot';
import { NotificationDAO } from '../database/dao/NotificationDAO';
import { UserService } from './UserService';
import { Notification, User, DatabaseResult } from '../database/models';
import { createLogger } from '../utils/logger';
import { Logger } from 'winston';

export interface NotificationChannel {
  type: 'telegram' | 'email' | 'push' | 'sms';
  enabled: boolean;
  config?: any;
}

export interface NotificationDeliveryResult {
  notification_id: number;
  user_id: number;
  channel: string;
  success: boolean;
  messageId?: number;
  error?: string;
  sentAt: Date;
}

export interface BulkDeliveryResult {
  total: number;
  successful: number;
  failed: number;
  results: NotificationDeliveryResult[];
  errors: string[];
}

export class NotificationSender {
  private logger: Logger;
  private telegramBot?: TelegramBotService;
  private notificationDAO: NotificationDAO;
  private userService: UserService;
  private enabledChannels: Set<string> = new Set(['telegram']);

  constructor(telegramBot?: TelegramBotService) {
    this.logger = createLogger('NotificationSender');
    this.telegramBot = telegramBot;
    this.notificationDAO = new NotificationDAO();
    this.userService = new UserService();
  }

  /**
   * Инициализирует сервис отправки уведомлений
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing NotificationSender...');

      // Инициализируем Telegram Bot если он предоставлен
      if (this.telegramBot) {
        await this.telegramBot.initialize();
        this.enabledChannels.add('telegram');
        this.logger.info('Telegram Bot channel enabled');
      }

      this.logger.info('NotificationSender initialized successfully', {
        enabledChannels: Array.from(this.enabledChannels),
      });
    } catch (error) {
      this.logger.error('Failed to initialize NotificationSender', { error });
      throw error;
    }
  }

  /**
   * Отправляет одно уведомление
   */
  async sendNotification(
    notification: Notification,
  ): Promise<NotificationDeliveryResult> {
    try {
      this.logger.debug('Sending notification', {
        notification_id: notification.notification_id,
        user_id: notification.user_id,
        type: notification.notification_type,
      });

      // Получаем информацию о пользователе
      const userResult = await this.userService.getUserById(
        notification.user_id,
      );
      if (!userResult.success || !userResult.data) {
        const error = 'User not found';
        this.logger.error(error, {
          notification_id: notification.notification_id,
          user_id: notification.user_id,
        });
        return this.createFailureResult(notification, 'telegram', error);
      }

      const user = userResult.data;

      // Проверяем, включены ли уведомления у пользователя
      if (!user.preferences.notifications) {
        const error = 'Notifications disabled for user';
        this.logger.debug(error, { user_id: user.user_id });
        return this.createFailureResult(notification, 'telegram', error);
      }

      // Отправляем через доступные каналы (пока только Telegram)
      const result = await this.sendViaTelegram(notification, user);

      // Обновляем статус уведомления в БД если отправка успешна
      if (result.success) {
        await this.notificationDAO.markAsSent(notification.notification_id);
        this.logger.info('Notification sent successfully', {
          notification_id: notification.notification_id,
          user_id: notification.user_id,
          messageId: result.messageId,
        });
      }

      return result;
    } catch (error) {
      this.logger.error('Error sending notification', {
        error,
        notification_id: notification.notification_id,
      });
      return this.createFailureResult(
        notification,
        'telegram',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Отправляет уведомление через Telegram
   */
  private async sendViaTelegram(
    notification: Notification,
    user: User,
  ): Promise<NotificationDeliveryResult> {
    try {
      if (!this.telegramBot || !this.telegramBot.isReady()) {
        const error = 'Telegram Bot not available';
        this.logger.warn(error);
        return this.createFailureResult(notification, 'telegram', error);
      }

      // Проверяем, доступен ли чат пользователя
      const isAccessible = await this.telegramBot.isChatAccessible(
        user.telegram_id,
      );
      if (!isAccessible) {
        const error = 'Chat not accessible';
        this.logger.warn(error, { telegram_id: user.telegram_id });
        return this.createFailureResult(notification, 'telegram', error);
      }

      // Формируем сообщение для отправки
      const message: NotificationMessage = {
        chatId: user.telegram_id,
        title: notification.title || undefined,
        content: notification.content,
        options: {
          parse_mode: 'HTML',
          disable_web_page_preview: true,
          disable_notification: false, // Для критических уведомлений всегда со звуком
        },
      };

      // Отправляем сообщение
      const sendResult = await this.telegramBot.sendNotification(message);

      return {
        notification_id: notification.notification_id,
        user_id: notification.user_id,
        channel: 'telegram',
        success: sendResult.success,
        messageId: sendResult.messageId,
        error: sendResult.error,
        sentAt: new Date(),
      };
    } catch (error) {
      this.logger.error('Error sending via Telegram', {
        error,
        notification_id: notification.notification_id,
        user_id: notification.user_id,
      });

      return this.createFailureResult(
        notification,
        'telegram',
        error instanceof Error ? error.message : 'Unknown error',
      );
    }
  }

  /**
   * Отправляет множественные уведомления
   */
  async sendBulkNotifications(
    notifications: Notification[],
  ): Promise<BulkDeliveryResult> {
    this.logger.info('Starting bulk notification delivery', {
      count: notifications.length,
    });

    const results: NotificationDeliveryResult[] = [];
    const errors: string[] = [];

    // Группируем уведомления по пользователям для оптимизации
    const notificationsByUser = this.groupNotificationsByUser(notifications);

    // Отправляем уведомления пользователям по очереди
    for (const [userId, userNotifications] of notificationsByUser) {
      try {
        this.logger.debug('Processing notifications for user', {
          userId,
          count: userNotifications.length,
        });

        // Отправляем уведомления пользователя с контролем rate limit
        for (const notification of userNotifications) {
          const result = await this.sendNotification(notification);
          results.push(result);

          if (!result.success && result.error) {
            errors.push(`User ${userId}: ${result.error}`);
          }

          // Небольшая задержка между уведомлениями одному пользователю
          if (userNotifications.length > 1) {
            await this.delay(200); // 200ms между сообщениями одному пользователю
          }
        }

        // Задержка между пользователями для соблюдения глобального rate limit
        await this.delay(100);
      } catch (error) {
        const errorMsg = `Failed to process notifications for user ${userId}: ${error}`;
        this.logger.error(errorMsg, { error, userId });
        errors.push(errorMsg);

        // Добавляем результаты неудачи для всех уведомлений пользователя
        userNotifications.forEach((notification) => {
          results.push(
            this.createFailureResult(notification, 'telegram', errorMsg),
          );
        });
      }
    }

    const successful = results.filter((r) => r.success).length;
    const failed = results.length - successful;

    this.logger.info('Bulk notification delivery completed', {
      total: notifications.length,
      successful,
      failed,
      errorCount: errors.length,
    });

    return {
      total: notifications.length,
      successful,
      failed,
      results,
      errors,
    };
  }

  /**
   * Отправляет неотправленные уведомления для пользователя
   */
  async sendPendingNotifications(userId: number): Promise<BulkDeliveryResult> {
    try {
      this.logger.info('Sending pending notifications for user', { userId });

      // Получаем неотправленные уведомления
      const pendingResult =
        await this.notificationDAO.getPendingForUser(userId);
      if (!pendingResult.success || !pendingResult.data) {
        this.logger.warn('No pending notifications found for user', { userId });
        return {
          total: 0,
          successful: 0,
          failed: 0,
          results: [],
          errors: [],
        };
      }

      return await this.sendBulkNotifications(pendingResult.data);
    } catch (error) {
      this.logger.error('Error sending pending notifications', {
        error,
        userId,
      });
      return {
        total: 0,
        successful: 0,
        failed: 1,
        results: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Отправляет все неотправленные уведомления
   */
  async sendAllPendingNotifications(): Promise<BulkDeliveryResult> {
    try {
      this.logger.info('Sending all pending notifications');

      // Получаем все неотправленные уведомления
      const pendingResult = await this.notificationDAO.getAll({
        is_sent: false,
      });
      if (!pendingResult.success || !pendingResult.data) {
        this.logger.info('No pending notifications found');
        return {
          total: 0,
          successful: 0,
          failed: 0,
          results: [],
          errors: [],
        };
      }

      return await this.sendBulkNotifications(pendingResult.data.items);
    } catch (error) {
      this.logger.error('Error sending all pending notifications', { error });
      return {
        total: 0,
        successful: 0,
        failed: 1,
        results: [],
        errors: [error instanceof Error ? error.message : 'Unknown error'],
      };
    }
  }

  /**
   * Группирует уведомления по пользователям
   */
  private groupNotificationsByUser(
    notifications: Notification[],
  ): Map<number, Notification[]> {
    const grouped = new Map<number, Notification[]>();

    for (const notification of notifications) {
      const userId = notification.user_id;
      if (!grouped.has(userId)) {
        grouped.set(userId, []);
      }
      grouped.get(userId)!.push(notification);
    }

    return grouped;
  }

  /**
   * Создает результат неудачной отправки
   */
  private createFailureResult(
    notification: Notification,
    channel: string,
    error: string,
  ): NotificationDeliveryResult {
    return {
      notification_id: notification.notification_id,
      user_id: notification.user_id,
      channel,
      success: false,
      error,
      sentAt: new Date(),
    };
  }

  /**
   * Задержка выполнения
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Проверяет состояние каналов отправки
   */
  async checkChannelHealth(): Promise<{
    telegram: boolean;
    email: boolean;
    overall: boolean;
  }> {
    const health = {
      telegram: false,
      email: false, // Пока не реализован
      overall: false,
    };

    // Проверяем Telegram Bot
    if (this.telegramBot && this.telegramBot.isReady()) {
      try {
        // Проверяем доступность API через getMe
        await this.telegramBot.getBotInstance().getMe();
        health.telegram = true;
      } catch (error) {
        this.logger.warn('Telegram Bot health check failed', { error });
      }
    }

    health.overall = health.telegram; // Пока зависит только от Telegram

    this.logger.debug('Channel health check completed', health);
    return health;
  }

  /**
   * Получает статистику отправок
   */
  async getDeliveryStats(
    userId?: number,
    timeframe?: { from: Date; to: Date },
  ): Promise<{
    total: number;
    sent: number;
    pending: number;
    failed: number;
  }> {
    try {
      if (userId) {
        const statsResult = await this.notificationDAO.getStatsByUser(userId);
        if (statsResult.success && statsResult.data) {
          return {
            total: statsResult.data.total,
            sent: statsResult.data.sent,
            pending: statsResult.data.pending,
            failed: 0, // Пока не отслеживаем failed отдельно
          };
        }
      }

      // Глобальная статистика (можно расширить позже)
      return {
        total: 0,
        sent: 0,
        pending: 0,
        failed: 0,
      };
    } catch (error) {
      this.logger.error('Error getting delivery stats', { error, userId });
      return {
        total: 0,
        sent: 0,
        pending: 0,
        failed: 0,
      };
    }
  }

  /**
   * Останавливает сервис
   */
  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping NotificationSender...');

      if (this.telegramBot) {
        await this.telegramBot.stop();
      }

      this.logger.info('NotificationSender stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping NotificationSender', { error });
    }
  }
}
