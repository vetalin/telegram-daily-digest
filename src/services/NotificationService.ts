/**
 * NotificationService - manages all notification-related operations
 */

import { NotificationDAO } from '../database/dao/NotificationDAO';
import { UserService } from './UserService';
import {
  CriticalNewsDetector,
  CriticalNewsResult,
} from './CriticalNewsDetector';
import { AIAnalysisService } from '../ai/AIAnalysisService';
import {
  Notification,
  CreateNotificationData,
  NotificationType,
  User,
  Message,
  DatabaseResult,
} from '../database/models';
import { createLogger } from '../utils/logger';
import { Logger } from 'winston';

export interface NotificationContext {
  user: User;
  message: Message;
  analysis?: CriticalNewsResult;
}

export interface NotificationQueue {
  notifications: CreateNotificationData[];
  priority: 'high' | 'normal' | 'low';
  scheduledAt?: Date;
}

export class NotificationService {
  private logger: Logger;
  private notificationDAO: NotificationDAO;
  private userService: UserService;
  private criticalNewsDetector: CriticalNewsDetector;

  constructor(aiService?: AIAnalysisService) {
    this.logger = createLogger('NotificationService');
    this.notificationDAO = new NotificationDAO();
    this.userService = new UserService();
    this.criticalNewsDetector = new CriticalNewsDetector(aiService);
  }

  /**
   * Анализирует сообщение и определяет, нужно ли отправлять мгновенное уведомление
   */
  async analyzeForImmedateNotification(
    message: Message,
  ): Promise<CriticalNewsResult> {
    try {
      this.logger.debug('Analyzing message for immediate notification', {
        message_id: message.message_id,
        importance_score: message.importance_score,
      });

      return await this.criticalNewsDetector.analyze(message);
    } catch (error) {
      this.logger.error('Error analyzing message for criticality', {
        error,
        message_id: message.message_id,
      });
      return {
        is_critical: false,
        criticality_score: 0,
        confidence: 0,
        factors: {
          importance_score: 0,
          critical_keywords: [],
          urgency_markers: [],
          critical_category: false,
          breaking_news: false,
          time_sensitivity: 'normal',
        },
        reasons: ['Analysis failed'],
        recommended_action: 'no_notification',
      };
    }
  }

  /**
   * Проверяет, находится ли пользователь в тихих часах
   */
  private isInQuietHours(user: User): boolean {
    if (!user.preferences.quiet_hours) {
      return false;
    }

    const now = new Date();
    const currentTime = now.getHours() * 60 + now.getMinutes(); // Минуты с начала дня

    const { start, end } = user.preferences.quiet_hours;
    const [startHour, startMin] = start.split(':').map(Number);
    const [endHour, endMin] = end.split(':').map(Number);

    const startTime = startHour * 60 + startMin;
    const endTime = endHour * 60 + endMin;

    // Обработка случая, когда тихие часы переходят через полночь
    if (startTime > endTime) {
      return currentTime >= startTime || currentTime <= endTime;
    } else {
      return currentTime >= startTime && currentTime <= endTime;
    }
  }

  /**
   * Определяет, должно ли быть отправлено уведомление пользователю
   */
  async shouldNotifyUser(
    user: User,
    analysis: CriticalNewsResult,
  ): Promise<{
    shouldNotify: boolean;
    reason: string;
  }> {
    try {
      // Проверяем, включены ли уведомления у пользователя
      if (!user.preferences.notifications) {
        return {
          shouldNotify: false,
          reason: 'User has notifications disabled',
        };
      }

      // Проверяем порог важности
      if (analysis.criticality_score < user.preferences.importance_threshold) {
        return {
          shouldNotify: false,
          reason: `Score ${analysis.criticality_score} below user threshold ${user.preferences.importance_threshold}`,
        };
      }

      // Проверяем критичность новости
      if (!analysis.is_critical) {
        return { shouldNotify: false, reason: 'Message is not critical' };
      }

      // Проверяем тихие часы (для критических новостей можем игнорировать)
      const inQuietHours = this.isInQuietHours(user);
      if (inQuietHours && analysis.criticality_score < 90) {
        // Только очень критичные новости проходят через тихие часы
        return {
          shouldNotify: false,
          reason:
            'User is in quiet hours and message is not extremely critical',
        };
      }

      return {
        shouldNotify: true,
        reason: `Critical message (score: ${analysis.criticality_score}, critical: ${analysis.is_critical})`,
      };
    } catch (error) {
      this.logger.error('Error determining if user should be notified', {
        error,
        user_id: user.user_id,
      });
      return { shouldNotify: false, reason: 'Error in notification logic' };
    }
  }

  /**
   * Создает уведомление для пользователя
   */
  async createNotification(
    data: CreateNotificationData,
  ): Promise<DatabaseResult<Notification>> {
    try {
      this.logger.info('Creating notification', {
        user_id: data.user_id,
        notification_type: data.notification_type,
      });

      return await this.notificationDAO.create(data);
    } catch (error) {
      this.logger.error('Error creating notification', { error, data });
      return { success: false, error: 'Failed to create notification' };
    }
  }

  /**
   * Обрабатывает сообщение и создает необходимые уведомления
   */
  async processMessageForNotifications(
    message: Message,
  ): Promise<DatabaseResult<Notification[]>> {
    try {
      this.logger.info('Processing message for notifications', {
        message_id: message.message_id,
      });

      // Анализируем критичность сообщения
      const analysis = await this.analyzeForImmedateNotification(message);

      if (!analysis.is_critical) {
        this.logger.debug(
          'Message is not critical, skipping immediate notifications',
          {
            message_id: message.message_id,
          },
        );
        return { success: true, data: [] };
      }

      // Получаем всех активных пользователей
      const usersResult = await this.userService.getAllUsers();
      if (!usersResult.success || !usersResult.data) {
        this.logger.error('Failed to get users for notifications');
        return { success: false, error: 'Failed to get users' };
      }

      const notifications: Notification[] = [];
      const errors: string[] = [];

      // Создаем уведомления для каждого пользователя
      for (const user of usersResult.data) {
        if (!user.is_active) {
          continue;
        }

        const notificationDecision = await this.shouldNotifyUser(
          user,
          analysis,
        );

        if (!notificationDecision.shouldNotify) {
          this.logger.debug('Skipping notification for user', {
            user_id: user.user_id,
            reason: notificationDecision.reason,
          });
          continue;
        }

        const notificationData: CreateNotificationData = {
          user_id: user.user_id,
          message_id: message.message_id,
          notification_type: 'immediate' as NotificationType,
          title: this.generateNotificationTitle(message, analysis),
          content: this.generateNotificationContent(message, analysis),
        };

        const result = await this.createNotification(notificationData);

        if (result.success && result.data) {
          notifications.push(result.data);
          this.logger.info('Notification created for user', {
            user_id: user.user_id,
            notification_id: result.data.notification_id,
          });
        } else {
          errors.push(
            `Failed to create notification for user ${user.user_id}: ${result.error}`,
          );
        }
      }

      if (errors.length > 0) {
        this.logger.warn('Some notifications failed to create', { errors });
      }

      this.logger.info('Message processing completed', {
        message_id: message.message_id,
        notifications_created: notifications.length,
        errors_count: errors.length,
      });

      return { success: true, data: notifications };
    } catch (error) {
      this.logger.error('Error processing message for notifications', {
        error,
        message_id: message.message_id,
      });
      return {
        success: false,
        error: 'Failed to process message for notifications',
      };
    }
  }

  /**
   * Генерирует заголовок уведомления
   */
  private generateNotificationTitle(
    message: Message,
    analysis: CriticalNewsResult,
  ): string {
    if (analysis.criticality_score >= 90) {
      return '🚨 Критически важная новость';
    } else if (analysis.criticality_score >= 80) {
      return '⚠️ Важная новость';
    } else {
      return '📢 Срочная новость';
    }
  }

  /**
   * Генерирует содержание уведомления
   */
  private generateNotificationContent(
    message: Message,
    analysis: CriticalNewsResult,
  ): string {
    let content = message.content;

    // Обрезаем контент если он слишком длинный
    if (content.length > 200) {
      content = content.substring(0, 197) + '...';
    }

    return content;
  }

  /**
   * Получает все уведомления пользователя
   */
  async getUserNotifications(
    userId: number,
  ): Promise<DatabaseResult<Notification[]>> {
    try {
      const result = await this.notificationDAO.getAll({ user_id: userId });
      if (result.success && result.data) {
        return { success: true, data: result.data.items };
      }
      return { success: false, error: result.error };
    } catch (error) {
      this.logger.error('Error getting user notifications', { error, userId });
      return { success: false, error: 'Failed to get user notifications' };
    }
  }

  /**
   * Получает неотправленные уведомления пользователя
   */
  async getPendingNotifications(
    userId: number,
  ): Promise<DatabaseResult<Notification[]>> {
    try {
      return await this.notificationDAO.getPendingForUser(userId);
    } catch (error) {
      this.logger.error('Error getting pending notifications', {
        error,
        userId,
      });
      return { success: false, error: 'Failed to get pending notifications' };
    }
  }

  /**
   * Отмечает уведомление как отправленное
   */
  async markNotificationAsSent(
    notificationId: number,
  ): Promise<DatabaseResult<Notification>> {
    try {
      return await this.notificationDAO.markAsSent(notificationId);
    } catch (error) {
      this.logger.error('Error marking notification as sent', {
        error,
        notificationId,
      });
      return { success: false, error: 'Failed to mark notification as sent' };
    }
  }

  /**
   * Получает статистику уведомлений пользователя
   */
  async getUserNotificationStats(userId: number) {
    try {
      return await this.notificationDAO.getStatsByUser(userId);
    } catch (error) {
      this.logger.error('Error getting user notification stats', {
        error,
        userId,
      });
      return { success: false, error: 'Failed to get notification stats' };
    }
  }
}
