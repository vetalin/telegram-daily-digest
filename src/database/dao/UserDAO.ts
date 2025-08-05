/**
 * UserDAO - Data Access Object для работы с пользователями
 */

import { db } from '../connection';
import {
  User,
  CreateUserData,
  UpdateUserData,
  DatabaseResult,
  UserPreferences,
  defaultUserPreferences,
} from '../models';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

export class UserDAO {
  private logger: Logger;

  constructor() {
    this.logger = createLogger('UserDAO');
  }

  private parseUserResult(row: any): User {
    return {
      ...row,
      preferences:
        typeof row.preferences === 'string'
          ? JSON.parse(row.preferences)
          : row.preferences,
    };
  }

  async create(data: CreateUserData): Promise<DatabaseResult<User>> {
    try {
      const preferences = {
        ...defaultUserPreferences,
        ...(data.preferences || {}),
      };

      const query = `
        INSERT INTO users (telegram_id, username, first_name, last_name, preferences)
        VALUES ($1, $2, $3, $4, $5)
        RETURNING *
      `;
      const values = [
        data.telegram_id,
        data.username,
        data.first_name,
        data.last_name,
        JSON.stringify(preferences),
      ];

      const result = await db.query(query, values);
      return {
        success: true,
        data: this.parseUserResult(result.rows[0]),
        affected_rows: result.rowCount || 0,
      };
    } catch (error) {
      this.logger.error('Ошибка создания пользователя:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  async findByTelegramId(telegramId: number): Promise<DatabaseResult<User>> {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE telegram_id = $1',
        [telegramId],
      );
      if (result.rows.length === 0) {
        return { success: false, error: 'Пользователь не найден' };
      }
      return { success: true, data: this.parseUserResult(result.rows[0]) };
    } catch (error) {
      this.logger.error('Ошибка поиска пользователя по Telegram ID:', error);
      return { success: false, error: 'Database error' };
    }
  }

  async findById(userId: number): Promise<DatabaseResult<User>> {
    try {
      const result = await db.query('SELECT * FROM users WHERE user_id = $1', [
        userId,
      ]);
      if (result.rows.length === 0) {
        return { success: false, error: 'Пользователь не найден' };
      }
      return { success: true, data: this.parseUserResult(result.rows[0]) };
    } catch (error) {
      this.logger.error('Ошибка поиска пользователя по ID:', error);
      return { success: false, error: 'Database error' };
    }
  }

  async update(
    userId: number,
    data: UpdateUserData,
  ): Promise<DatabaseResult<User>> {
    try {
      const existingUser = await this.findById(userId);
      if (!existingUser.success || !existingUser.data) {
        return { success: false, error: 'Пользователь не найден' };
      }

      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (data.username !== undefined) {
        updateFields.push(`username = $${paramCount++}`);
        values.push(data.username);
      }
      if (data.first_name !== undefined) {
        updateFields.push(`first_name = $${paramCount++}`);
        values.push(data.first_name);
      }
      if (data.last_name !== undefined) {
        updateFields.push(`last_name = $${paramCount++}`);
        values.push(data.last_name);
      }
      if (data.is_active !== undefined) {
        updateFields.push(`is_active = $${paramCount++}`);
        values.push(data.is_active);
      }
      if (data.preferences !== undefined) {
        const updatedPreferences = {
          ...existingUser.data.preferences,
          ...data.preferences,
        };
        updateFields.push(`preferences = $${paramCount++}`);
        values.push(JSON.stringify(updatedPreferences));
      }

      if (updateFields.length === 0) {
        return { success: true, data: existingUser.data };
      }

      updateFields.push(`updated_at = NOW()`);
      values.push(userId);

      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')}
        WHERE user_id = $${paramCount}
        RETURNING *
      `;

      const result = await db.query(query, values);

      return {
        success: true,
        data: this.parseUserResult(result.rows[0]),
        affected_rows: result.rowCount || 0,
      };
    } catch (error) {
      this.logger.error('Ошибка обновления пользователя:', error);
      return { success: false, error: 'Database error' };
    }
  }

  async getActiveUsers(): Promise<DatabaseResult<User[]>> {
    try {
      const result = await db.query(
        'SELECT * FROM users WHERE is_active = true ORDER BY created_at DESC',
      );
      return { success: true, data: result.rows.map(this.parseUserResult) };
    } catch (error) {
      this.logger.error('Ошибка получения активных пользователей:', error);
      return { success: false, error: 'Database error', data: [] };
    }
  }
}

export const userDAO = new UserDAO();
