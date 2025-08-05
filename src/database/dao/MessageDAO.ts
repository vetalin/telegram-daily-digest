/**
 * MessageDAO - Data Access Object для работы с сообщениями
 */

import { db } from '../connection';
import {
  Message,
  CreateMessageData,
  UpdateMessageData,
  MessageAnalysis,
  DatabaseResult,
  PaginatedResult,
  PaginationOptions,
  DateFilter,
  SearchFilter,
} from '../models';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

export interface MessageFilters extends DateFilter, SearchFilter {
  channel_id?: number;
  is_filtered?: boolean;
  is_processed?: boolean;
  min_importance_score?: number;
  category?: string;
}

export class MessageDAO {
  private logger: Logger;

  constructor() {
    this.logger = createLogger('MessageDAO');
  }

  /**
   * Создает новое сообщение
   */
  async create(data: CreateMessageData): Promise<DatabaseResult<Message>> {
    try {
      const query = `
        INSERT INTO messages (
          telegram_message_id, 
          channel_id, 
          sender_id, 
          content, 
          media_type, 
          media_url
        )
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (telegram_message_id, channel_id) DO NOTHING
        RETURNING *
      `;

      const values = [
        data.telegram_message_id,
        data.channel_id,
        data.sender_id,
        data.content,
        data.media_type,
        data.media_url,
      ];

      const result = await db.query<Message>(query, values);

      if (result.rowCount === 0) {
        // Сообщение уже существует, получаем его
        const existingMessage = await this.getByTelegramId(
          data.telegram_message_id,
          data.channel_id
        );
        
        if (existingMessage.success && existingMessage.data) {
          this.logger.debug('Сообщение уже существует', {
            telegramMessageId: data.telegram_message_id,
            channelId: data.channel_id,
          });
          return existingMessage;
        }
      }

      this.logger.info('Новое сообщение сохранено', {
        messageId: result.rows[0].message_id,
        telegramMessageId: data.telegram_message_id,
        channelId: data.channel_id,
      });

      return {
        success: true,
        data: result.rows[0],
        affected_rows: result.rowCount || 0,
      };
    } catch (error) {
      this.logger.error('Ошибка создания сообщения:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Получает сообщение по Telegram ID и каналу
   */
  async getByTelegramId(
    telegramMessageId: number,
    channelId: number
  ): Promise<DatabaseResult<Message>> {
    try {
      const query = `
        SELECT m.*, c.channel_name, c.channel_username
        FROM messages m
        LEFT JOIN channels c ON m.channel_id = c.channel_id
        WHERE m.telegram_message_id = $1 AND m.channel_id = $2
      `;

      const result = await db.query<Message>(query, [telegramMessageId, channelId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Сообщение не найдено',
        };
      }

      return {
        success: true,
        data: result.rows[0],
      };
    } catch (error) {
      this.logger.error('Ошибка получения сообщения по Telegram ID:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Получает сообщение по ID
   */
  async getById(messageId: number): Promise<DatabaseResult<Message>> {
    try {
      const query = `
        SELECT m.*, c.channel_name, c.channel_username
        FROM messages m
        LEFT JOIN channels c ON m.channel_id = c.channel_id
        WHERE m.message_id = $1
      `;

      const result = await db.query<Message>(query, [messageId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Сообщение не найдено',
        };
      }

      return {
        success: true,
        data: result.rows[0],
      };
    } catch (error) {
      this.logger.error('Ошибка получения сообщения по ID:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Получает сообщения с фильтрами и пагинацией
   */
  async getMessages(
    filters?: MessageFilters,
    options?: PaginationOptions
  ): Promise<PaginatedResult<Message>> {
    try {
      let query = `
        SELECT m.*, c.channel_name, c.channel_username
        FROM messages m
        LEFT JOIN channels c ON m.channel_id = c.channel_id
        WHERE 1=1
      `;

      let countQuery = `
        SELECT COUNT(*) as total
        FROM messages m
        LEFT JOIN channels c ON m.channel_id = c.channel_id
        WHERE 1=1
      `;

      const values: any[] = [];
      let paramIndex = 1;

      // Добавляем фильтры
      if (filters) {
        let filterClause = '';

        if (filters.channel_id !== undefined) {
          filterClause += ` AND m.channel_id = $${paramIndex++}`;
          values.push(filters.channel_id);
        }

        if (filters.is_filtered !== undefined) {
          filterClause += ` AND m.is_filtered = $${paramIndex++}`;
          values.push(filters.is_filtered);
        }

        if (filters.is_processed !== undefined) {
          filterClause += ` AND m.is_processed = $${paramIndex++}`;
          values.push(filters.is_processed);
        }

        if (filters.min_importance_score !== undefined) {
          filterClause += ` AND m.importance_score >= $${paramIndex++}`;
          values.push(filters.min_importance_score);
        }

        if (filters.category) {
          filterClause += ` AND m.category = $${paramIndex++}`;
          values.push(filters.category);
        }

        if (filters.start_date) {
          filterClause += ` AND m.created_at >= $${paramIndex++}`;
          values.push(filters.start_date);
        }

        if (filters.end_date) {
          filterClause += ` AND m.created_at <= $${paramIndex++}`;
          values.push(filters.end_date);
        }

        if (filters.query && filters.fields) {
          const searchFields = filters.fields.map(field => `${field} ILIKE $${paramIndex}`).join(' OR ');
          filterClause += ` AND (${searchFields})`;
          values.push(`%${filters.query}%`);
          paramIndex++;
        }

        query += filterClause;
        countQuery += filterClause;
      }

      // Добавляем сортировку
      query += ` ORDER BY m.created_at DESC`;

      // Добавляем пагинацию
      if (options) {
        const { limit, offset } = options;
        query += ` LIMIT $${paramIndex++} OFFSET $${paramIndex++}`;
        values.push(limit, offset || (options.page - 1) * limit);
      }

      const [dataResult, countResult] = await Promise.all([
        db.query<Message>(query, values),
        db.query<{ total: string }>(countQuery, values.slice(0, paramIndex - (options ? 2 : 0))),
      ]);

      const total = parseInt(countResult.rows[0].total);
      const totalPages = options ? Math.ceil(total / options.limit) : 1;

      return {
        data: dataResult.rows,
        total,
        page: options?.page || 1,
        limit: options?.limit || total,
        total_pages: totalPages,
      };
    } catch (error) {
      this.logger.error('Ошибка получения сообщений:', error);
      return {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        total_pages: 0,
      };
    }
  }

  /**
   * Обновляет сообщение
   */
  async update(messageId: number, data: UpdateMessageData): Promise<DatabaseResult<Message>> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.content !== undefined) {
        updateFields.push(`content = $${paramIndex++}`);
        values.push(data.content);
      }

      if (data.is_filtered !== undefined) {
        updateFields.push(`is_filtered = $${paramIndex++}`);
        values.push(data.is_filtered);
      }

      if (data.is_processed !== undefined) {
        updateFields.push(`is_processed = $${paramIndex++}`);
        values.push(data.is_processed);
      }

      if (data.importance_score !== undefined) {
        updateFields.push(`importance_score = $${paramIndex++}`);
        values.push(data.importance_score);
      }

      if (data.category !== undefined) {
        updateFields.push(`category = $${paramIndex++}`);
        values.push(data.category);
      }

      if (updateFields.length === 0) {
        return {
          success: false,
          error: 'Нет полей для обновления',
        };
      }

      values.push(messageId);
      const query = `
        UPDATE messages
        SET ${updateFields.join(', ')}
        WHERE message_id = $${paramIndex}
        RETURNING *
      `;

      const result = await db.query<Message>(query, values);

      if (result.rowCount === 0) {
        return {
          success: false,
          error: 'Сообщение не найдено',
        };
      }

      this.logger.info(`Сообщение обновлено: ${messageId}`);

      return {
        success: true,
        data: result.rows[0],
        affected_rows: result.rowCount,
      };
    } catch (error) {
      this.logger.error('Ошибка обновления сообщения:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Обновляет анализ сообщения
   */
  async updateAnalysis(messageId: number, analysis: MessageAnalysis): Promise<DatabaseResult<Message>> {
    try {
      const query = `
        UPDATE messages
        SET 
          importance_score = $1,
          category = $2,
          is_processed = true
        WHERE message_id = $3
        RETURNING *
      `;

      const values = [
        analysis.importance_score,
        analysis.category,
        messageId,
      ];

      const result = await db.query<Message>(query, values);

      if (result.rowCount === 0) {
        return {
          success: false,
          error: 'Сообщение не найдено',
        };
      }

      this.logger.info(`Анализ сообщения обновлен: ${messageId}`, {
        importance: analysis.importance_score,
        category: analysis.category,
      });

      return {
        success: true,
        data: result.rows[0],
        affected_rows: result.rowCount,
      };
    } catch (error) {
      this.logger.error('Ошибка обновления анализа сообщения:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Удаляет сообщение
   */
  async delete(messageId: number): Promise<DatabaseResult<void>> {
    try {
      const query = `
        DELETE FROM messages
        WHERE message_id = $1
      `;

      const result = await db.query(query, [messageId]);

      if (result.rowCount === 0) {
        return {
          success: false,
          error: 'Сообщение не найдено',
        };
      }

      this.logger.info(`Сообщение удалено: ${messageId}`);

      return {
        success: true,
        affected_rows: result.rowCount,
      };
    } catch (error) {
      this.logger.error('Ошибка удаления сообщения:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Получает необработанные сообщения для анализа
   */
  async getUnprocessedMessages(limit: number = 100): Promise<DatabaseResult<Message[]>> {
    try {
      const query = `
        SELECT m.*, c.channel_name, c.channel_username
        FROM messages m
        LEFT JOIN channels c ON m.channel_id = c.channel_id
        WHERE m.is_processed = false
        ORDER BY m.created_at ASC
        LIMIT $1
      `;

      const result = await db.query<Message>(query, [limit]);

      return {
        success: true,
        data: result.rows,
      };
    } catch (error) {
      this.logger.error('Ошибка получения необработанных сообщений:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        data: [],
      };
    }
  }

  /**
   * Получает статистику сообщений
   */
  async getStatistics(channelId?: number): Promise<DatabaseResult<any>> {
    try {
      let query = `
        SELECT 
          COUNT(*) as total_messages,
          COUNT(CASE WHEN is_filtered = true THEN 1 END) as filtered_messages,
          COUNT(CASE WHEN is_processed = true THEN 1 END) as processed_messages,
          AVG(importance_score) as avg_importance,
          COUNT(DISTINCT category) as unique_categories
        FROM messages
      `;

      const values: any[] = [];

      if (channelId) {
        query += ` WHERE channel_id = $1`;
        values.push(channelId);
      }

      const result = await db.query(query, values);

      return {
        success: true,
        data: result.rows[0],
      };
    } catch (error) {
      this.logger.error('Ошибка получения статистики сообщений:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Полнотекстовый поиск сообщений
   */
  async searchMessages(
    searchQuery: string,
    options?: PaginationOptions
  ): Promise<PaginatedResult<Message>> {
    try {
      const query = `
        SELECT m.*, c.channel_name, c.channel_username,
               ts_rank(to_tsvector('russian', m.content), plainto_tsquery('russian', $1)) as rank
        FROM messages m
        LEFT JOIN channels c ON m.channel_id = c.channel_id
        WHERE to_tsvector('russian', m.content) @@ plainto_tsquery('russian', $1)
        ORDER BY rank DESC, m.created_at DESC
      `;

      const countQuery = `
        SELECT COUNT(*) as total
        FROM messages m
        WHERE to_tsvector('russian', m.content) @@ plainto_tsquery('russian', $1)
      `;

      let values = [searchQuery];

      let finalQuery = query;
      if (options) {
        const { limit, offset } = options;
        finalQuery += ` LIMIT $2 OFFSET $3`;
        values.push(limit, offset || (options.page - 1) * limit);
      }

      const [dataResult, countResult] = await Promise.all([
        db.query<Message>(finalQuery, values),
        db.query<{ total: string }>(countQuery, [searchQuery]),
      ]);

      const total = parseInt(countResult.rows[0].total);
      const totalPages = options ? Math.ceil(total / options.limit) : 1;

      return {
        data: dataResult.rows,
        total,
        page: options?.page || 1,
        limit: options?.limit || total,
        total_pages: totalPages,
      };
    } catch (error) {
      this.logger.error('Ошибка поиска сообщений:', error);
      return {
        data: [],
        total: 0,
        page: 1,
        limit: 10,
        total_pages: 0,
      };
    }
  }
}

// Создаем singleton instance
export const messageDAO = new MessageDAO();