/**
 * ChannelDAO - Data Access Object для работы с каналами
 */

import { db } from '../connection';
import {
  Channel,
  CreateChannelData,
  UpdateChannelData,
  UserChannelSubscription,
  DatabaseResult,
  PaginatedResult,
  PaginationOptions,
} from '../models';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

export class ChannelDAO {
  private logger: Logger;

  constructor() {
    this.logger = createLogger('ChannelDAO');
  }

  /**
   * Создает новый канал
   */
  async create(data: CreateChannelData): Promise<DatabaseResult<Channel>> {
    try {
      const query = `
        INSERT INTO channels (telegram_channel_id, channel_name, channel_username, description)
        VALUES ($1, $2, $3, $4)
        RETURNING *
      `;

      const values = [
        data.telegram_channel_id,
        data.channel_name,
        data.channel_username,
        data.description,
      ];

      const result = await db.query<Channel>(query, values);

      this.logger.info(`Канал создан: ${data.channel_name}`, {
        channelId: result.rows[0].channel_id,
        telegramChannelId: data.telegram_channel_id,
      });

      return {
        success: true,
        data: result.rows[0],
        affected_rows: result.rowCount || 0,
      };
    } catch (error) {
      this.logger.error('Ошибка создания канала:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Получает канал по Telegram ID
   */
  async getByTelegramId(telegramChannelId: number): Promise<DatabaseResult<Channel>> {
    try {
      const query = `
        SELECT * FROM channels
        WHERE telegram_channel_id = $1
      `;

      const result = await db.query<Channel>(query, [telegramChannelId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Канал не найден',
        };
      }

      return {
        success: true,
        data: result.rows[0],
      };
    } catch (error) {
      this.logger.error('Ошибка получения канала по Telegram ID:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Получает канал по ID
   */
  async getById(channelId: number): Promise<DatabaseResult<Channel>> {
    try {
      const query = `
        SELECT * FROM channels
        WHERE channel_id = $1
      `;

      const result = await db.query<Channel>(query, [channelId]);

      if (result.rows.length === 0) {
        return {
          success: false,
          error: 'Канал не найден',
        };
      }

      return {
        success: true,
        data: result.rows[0],
      };
    } catch (error) {
      this.logger.error('Ошибка получения канала по ID:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Получает все активные каналы
   */
  async getActiveChannels(options?: PaginationOptions): Promise<PaginatedResult<Channel>> {
    try {
      let query = `
        SELECT * FROM channels
        WHERE is_active = true
        ORDER BY channel_name
      `;

      const countQuery = `
        SELECT COUNT(*) as total FROM channels
        WHERE is_active = true
      `;

      let values: any[] = [];

      if (options) {
        const { limit, offset } = options;
        query += ` LIMIT $1 OFFSET $2`;
        values = [limit, offset || (options.page - 1) * limit];
      }

      const [dataResult, countResult] = await Promise.all([
        db.query<Channel>(query, values),
        db.query<{ total: string }>(countQuery),
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
      this.logger.error('Ошибка получения активных каналов:', error);
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
   * Обновляет канал
   */
  async update(channelId: number, data: UpdateChannelData): Promise<DatabaseResult<Channel>> {
    try {
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramIndex = 1;

      if (data.channel_name !== undefined) {
        updateFields.push(`channel_name = $${paramIndex++}`);
        values.push(data.channel_name);
      }

      if (data.channel_username !== undefined) {
        updateFields.push(`channel_username = $${paramIndex++}`);
        values.push(data.channel_username);
      }

      if (data.description !== undefined) {
        updateFields.push(`description = $${paramIndex++}`);
        values.push(data.description);
      }

      if (data.is_active !== undefined) {
        updateFields.push(`is_active = $${paramIndex++}`);
        values.push(data.is_active);
      }

      if (updateFields.length === 0) {
        return {
          success: false,
          error: 'Нет полей для обновления',
        };
      }

      values.push(channelId);
      const query = `
        UPDATE channels
        SET ${updateFields.join(', ')}
        WHERE channel_id = $${paramIndex}
        RETURNING *
      `;

      const result = await db.query<Channel>(query, values);

      if (result.rowCount === 0) {
        return {
          success: false,
          error: 'Канал не найден',
        };
      }

      this.logger.info(`Канал обновлен: ${channelId}`);

      return {
        success: true,
        data: result.rows[0],
        affected_rows: result.rowCount,
      };
    } catch (error) {
      this.logger.error('Ошибка обновления канала:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Удаляет канал
   */
  async delete(channelId: number): Promise<DatabaseResult<void>> {
    try {
      const query = `
        DELETE FROM channels
        WHERE channel_id = $1
      `;

      const result = await db.query(query, [channelId]);

      if (result.rowCount === 0) {
        return {
          success: false,
          error: 'Канал не найден',
        };
      }

      this.logger.info(`Канал удален: ${channelId}`);

      return {
        success: true,
        affected_rows: result.rowCount,
      };
    } catch (error) {
      this.logger.error('Ошибка удаления канала:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Добавляет пользователя к каналу (подписка)
   */
  async addUserSubscription(userId: number, channelId: number): Promise<DatabaseResult<UserChannelSubscription>> {
    try {
      const query = `
        INSERT INTO user_channels (user_id, channel_id)
        VALUES ($1, $2)
        ON CONFLICT (user_id, channel_id) DO NOTHING
        RETURNING *
      `;

      const result = await db.query<UserChannelSubscription>(query, [userId, channelId]);

      this.logger.info(`Пользователь ${userId} подписан на канал ${channelId}`);

      return {
        success: true,
        data: result.rows[0],
        affected_rows: result.rowCount || 0,
      };
    } catch (error) {
      this.logger.error('Ошибка добавления подписки на канал:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Удаляет подписку пользователя на канал
   */
  async removeUserSubscription(userId: number, channelId: number): Promise<DatabaseResult<void>> {
    try {
      const query = `
        DELETE FROM user_channels
        WHERE user_id = $1 AND channel_id = $2
      `;

      const result = await db.query(query, [userId, channelId]);

      this.logger.info(`Пользователь ${userId} отписан от канала ${channelId}`);

      return {
        success: true,
        affected_rows: result.rowCount || 0,
      };
    } catch (error) {
      this.logger.error('Ошибка удаления подписки на канал:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Получает каналы, на которые подписан пользователь
   */
  async getUserChannels(userId: number): Promise<DatabaseResult<Channel[]>> {
    try {
      const query = `
        SELECT c.* FROM channels c
        INNER JOIN user_channels uc ON c.channel_id = uc.channel_id
        WHERE uc.user_id = $1 AND c.is_active = true
        ORDER BY c.channel_name
      `;

      const result = await db.query<Channel>(query, [userId]);

      return {
        success: true,
        data: result.rows,
      };
    } catch (error) {
      this.logger.error('Ошибка получения каналов пользователя:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        data: [],
      };
    }
  }

  /**
   * Создает канал или возвращает существующий
   */
  async createOrGet(data: CreateChannelData): Promise<DatabaseResult<Channel>> {
    try {
      // Сначала пытаемся найти существующий канал
      const existing = await this.getByTelegramId(data.telegram_channel_id);
      
      if (existing.success && existing.data) {
        return existing;
      }

      // Если не найден, создаем новый
      return await this.create(data);
    } catch (error) {
      this.logger.error('Ошибка создания или получения канала:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }
}

// Создаем singleton instance
export const channelDAO = new ChannelDAO();