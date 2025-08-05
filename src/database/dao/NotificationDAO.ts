/**
 * NotificationDAO - Data Access Object для работы с уведомлениями
 */

import { db } from '../connection';
import {
  Notification,
  CreateNotificationData,
  UpdateNotificationData,
  DatabaseResult,
  PaginatedResult,
  PaginationOptions,
} from '../models';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

export interface NotificationFilters {
  user_id?: number;
  message_id?: number;
  notification_type?: string;
  is_sent?: boolean;
  date_from?: Date;
  date_to?: Date;
}

export class NotificationDAO {
  private logger: Logger;

  constructor() {
    this.logger = createLogger('NotificationDAO');
  }

  /**
   * Создает новое уведомление
   */
  async create(
    data: CreateNotificationData,
  ): Promise<DatabaseResult<Notification>> {
    try {
      const query = `
        INSERT INTO notifications (
          user_id, 
          message_id, 
          notification_type, 
          title, 
          content
        )
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;

      const values = [
        data.user_id,
        data.message_id || null,
        data.notification_type,
        data.title || null,
        data.content,
      ];

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        this.logger.warn('Failed to create notification', { data });
        return { success: false, error: 'Failed to create notification' };
      }

      const notification = result.rows[0];
      this.logger.info('Notification created successfully', {
        notification_id: notification.notification_id,
        user_id: notification.user_id,
      });

      return { success: true, data: notification };
    } catch (error) {
      this.logger.error('Error creating notification', { error, data });
      return {
        success: false,
        error: 'Database error while creating notification',
      };
    }
  }

  /**
   * Получает уведомление по ID
   */
  async getById(id: number): Promise<DatabaseResult<Notification>> {
    try {
      const query = 'SELECT * FROM notifications WHERE notification_id = $1';
      const result = await db.query(query, [id]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Notification not found' };
      }

      return { success: true, data: result.rows[0] };
    } catch (error) {
      this.logger.error('Error getting notification by ID', { error, id });
      return {
        success: false,
        error: 'Database error while fetching notification',
      };
    }
  }

  /**
   * Получает список уведомлений с фильтрацией
   */
  async getAll(
    filters: NotificationFilters = {},
    pagination: PaginationOptions = { page: 1, limit: 50 },
  ): Promise<DatabaseResult<PaginatedResult<Notification>>> {
    try {
      const { page, limit } = pagination;
      const offset = (page - 1) * limit;

      let whereClause = 'WHERE 1=1';
      const values: any[] = [];
      let valueIndex = 1;

      // Применяем фильтры
      if (filters.user_id !== undefined) {
        whereClause += ` AND user_id = $${valueIndex++}`;
        values.push(filters.user_id);
      }

      if (filters.message_id !== undefined) {
        whereClause += ` AND message_id = $${valueIndex++}`;
        values.push(filters.message_id);
      }

      if (filters.notification_type) {
        whereClause += ` AND notification_type = $${valueIndex++}`;
        values.push(filters.notification_type);
      }

      if (filters.is_sent !== undefined) {
        whereClause += ` AND is_sent = $${valueIndex++}`;
        values.push(filters.is_sent);
      }

      if (filters.date_from) {
        whereClause += ` AND created_at >= $${valueIndex++}`;
        values.push(filters.date_from);
      }

      if (filters.date_to) {
        whereClause += ` AND created_at <= $${valueIndex++}`;
        values.push(filters.date_to);
      }

      // Запрос для подсчета общего количества
      const countQuery = `SELECT COUNT(*) FROM notifications ${whereClause}`;
      const countResult = await db.query(countQuery, values);
      const totalCount = parseInt(countResult.rows[0].count);

      // Основной запрос с пагинацией
      const query = `
        SELECT * FROM notifications 
        ${whereClause}
        ORDER BY created_at DESC
        LIMIT $${valueIndex++} OFFSET $${valueIndex++}
      `;

      values.push(limit, offset);
      const result = await db.query(query, values);

      const totalPages = Math.ceil(totalCount / limit);

      return {
        success: true,
        data: {
          items: result.rows,
          pagination: {
            page,
            limit,
            totalCount,
            totalPages,
            hasNext: page < totalPages,
            hasPrev: page > 1,
          },
        },
      };
    } catch (error) {
      this.logger.error('Error getting notifications', { error, filters });
      return {
        success: false,
        error: 'Database error while fetching notifications',
      };
    }
  }

  /**
   * Обновляет уведомление
   */
  async update(
    id: number,
    data: UpdateNotificationData,
  ): Promise<DatabaseResult<Notification>> {
    try {
      const updates: string[] = [];
      const values: any[] = [];
      let valueIndex = 1;

      if (data.is_sent !== undefined) {
        updates.push(`is_sent = $${valueIndex++}`);
        values.push(data.is_sent);
      }

      if (data.sent_at !== undefined) {
        updates.push(`sent_at = $${valueIndex++}`);
        values.push(data.sent_at);
      }

      if (updates.length === 0) {
        return { success: false, error: 'No fields to update' };
      }

      values.push(id);

      const query = `
        UPDATE notifications 
        SET ${updates.join(', ')}
        WHERE notification_id = $${valueIndex}
        RETURNING *
      `;

      const result = await db.query(query, values);

      if (result.rows.length === 0) {
        return { success: false, error: 'Notification not found' };
      }

      this.logger.info('Notification updated successfully', {
        notification_id: id,
        updates: Object.keys(data),
      });

      return { success: true, data: result.rows[0] };
    } catch (error) {
      this.logger.error('Error updating notification', { error, id, data });
      return {
        success: false,
        error: 'Database error while updating notification',
      };
    }
  }

  /**
   * Удаляет уведомление
   */
  async delete(id: number): Promise<DatabaseResult<void>> {
    try {
      const query = 'DELETE FROM notifications WHERE notification_id = $1';
      const result = await db.query(query, [id]);

      if (result.rowCount === 0) {
        return { success: false, error: 'Notification not found' };
      }

      this.logger.info('Notification deleted successfully', {
        notification_id: id,
      });
      return { success: true };
    } catch (error) {
      this.logger.error('Error deleting notification', { error, id });
      return {
        success: false,
        error: 'Database error while deleting notification',
      };
    }
  }

  /**
   * Получает неотправленные уведомления для пользователя
   */
  async getPendingForUser(
    userId: number,
  ): Promise<DatabaseResult<Notification[]>> {
    try {
      const query = `
        SELECT * FROM notifications 
        WHERE user_id = $1 AND is_sent = false
        ORDER BY created_at ASC
      `;

      const result = await db.query(query, [userId]);
      return { success: true, data: result.rows };
    } catch (error) {
      this.logger.error('Error getting pending notifications for user', {
        error,
        userId,
      });
      return {
        success: false,
        error: 'Database error while fetching pending notifications',
      };
    }
  }

  /**
   * Отмечает уведомление как отправленное
   */
  async markAsSent(id: number): Promise<DatabaseResult<Notification>> {
    try {
      const query = `
        UPDATE notifications 
        SET is_sent = true, sent_at = CURRENT_TIMESTAMP
        WHERE notification_id = $1
        RETURNING *
      `;

      const result = await db.query(query, [id]);

      if (result.rows.length === 0) {
        return { success: false, error: 'Notification not found' };
      }

      this.logger.info('Notification marked as sent', { notification_id: id });
      return { success: true, data: result.rows[0] };
    } catch (error) {
      this.logger.error('Error marking notification as sent', { error, id });
      return {
        success: false,
        error: 'Database error while updating notification',
      };
    }
  }

  /**
   * Получает статистику уведомлений по пользователю
   */
  async getStatsByUser(userId: number): Promise<
    DatabaseResult<{
      total: number;
      sent: number;
      pending: number;
      byType: Record<string, number>;
    }>
  > {
    try {
      const queries = [
        // Общее количество
        'SELECT COUNT(*) as total FROM notifications WHERE user_id = $1',
        // Отправленные
        'SELECT COUNT(*) as sent FROM notifications WHERE user_id = $1 AND is_sent = true',
        // Ожидающие
        'SELECT COUNT(*) as pending FROM notifications WHERE user_id = $1 AND is_sent = false',
        // По типам
        `SELECT notification_type, COUNT(*) as count 
         FROM notifications 
         WHERE user_id = $1 
         GROUP BY notification_type`,
      ];

      const [totalResult, sentResult, pendingResult, byTypeResult] =
        await Promise.all(queries.map((query) => db.query(query, [userId])));

      const byType: Record<string, number> = {};
      byTypeResult.rows.forEach((row) => {
        byType[row.notification_type] = parseInt(row.count);
      });

      const stats = {
        total: parseInt(totalResult.rows[0].total),
        sent: parseInt(sentResult.rows[0].sent),
        pending: parseInt(pendingResult.rows[0].pending),
        byType,
      };

      return { success: true, data: stats };
    } catch (error) {
      this.logger.error('Error getting notification stats', { error, userId });
      return {
        success: false,
        error: 'Database error while fetching notification stats',
      };
    }
  }
}
