/**
 * UserService - handles all user-related database operations
 */

import { db } from '../database/connection';
import logger from '../utils/logger';
import {
  User,
  CreateUserData,
  UpdateUserData,
  UserPreferences,
  defaultUserPreferences,
} from '../database/models/User';
import {
  createUserSchema,
  updateUserSchema,
  ValidationUtils,
} from '../utils/validation';

export class UserService {
  private readonly logger = logger.child({ service: 'UserService' });

  /**
   * Create a new user
   */
  async createUser(userData: CreateUserData): Promise<User> {
    this.logger.info('Creating new user', {
      telegram_id: userData.telegram_id,
    });

    try {
      // Validate input data
      const validatedData = createUserSchema.parse(userData);

      // Merge with default preferences
      const preferences = {
        ...defaultUserPreferences,
        ...(validatedData.preferences || {}),
      };

      const query = `
        INSERT INTO users (
          telegram_id, 
          username, 
          first_name, 
          last_name, 
          is_active, 
          preferences, 
          created_at, 
          updated_at
        )
        VALUES ($1, $2, $3, $4, $5, $6, NOW(), NOW())
        RETURNING *
      `;

      const values = [
        validatedData.telegram_id,
        validatedData.username || null,
        validatedData.first_name || null,
        validatedData.last_name || null,
        true, // is_active defaults to true
        JSON.stringify(preferences),
      ];

      const result = await db.query<User>(query, values);

      if (result.rows.length === 0) {
        throw new Error('Failed to create user');
      }

      const createdUser = this.parseUserResult(result.rows[0]);
      this.logger.info('User created successfully', {
        user_id: createdUser.user_id,
      });

      return createdUser;
    } catch (error) {
      this.logger.error('Failed to create user', {
        telegram_id: userData.telegram_id,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get user by Telegram ID
   */
  async getUserByTelegramId(telegramId: number): Promise<User | null> {
    this.logger.debug('Getting user by Telegram ID', {
      telegram_id: telegramId,
    });

    try {
      // Validate Telegram ID
      ValidationUtils.validateTelegramId(telegramId);

      const query = 'SELECT * FROM users WHERE telegram_id = $1';
      const result = await db.query<User>(query, [telegramId]);

      if (result.rows.length === 0) {
        this.logger.debug('User not found', { telegram_id: telegramId });
        return null;
      }

      const user = this.parseUserResult(result.rows[0]);
      this.logger.debug('User found', { user_id: user.user_id });

      return user;
    } catch (error) {
      this.logger.error('Failed to get user by Telegram ID', {
        telegram_id: telegramId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get user by internal user ID
   */
  async getUserById(userId: number): Promise<User | null> {
    this.logger.debug('Getting user by ID', { user_id: userId });

    try {
      const query = 'SELECT * FROM users WHERE user_id = $1';
      const result = await db.query<User>(query, [userId]);

      if (result.rows.length === 0) {
        this.logger.debug('User not found', { user_id: userId });
        return null;
      }

      const user = this.parseUserResult(result.rows[0]);
      this.logger.debug('User found', { user_id: user.user_id });

      return user;
    } catch (error) {
      this.logger.error('Failed to get user by ID', {
        user_id: userId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Update user data
   */
  async updateUser(userId: number, updateData: UpdateUserData): Promise<User> {
    this.logger.info('Updating user', { user_id: userId });

    try {
      // Validate input data
      const validatedData = updateUserSchema.parse(updateData);

      // Check if user exists
      const existingUser = await this.getUserById(userId);
      if (!existingUser) {
        throw new Error(`User with ID ${userId} not found`);
      }

      // Build dynamic query
      const updateFields: string[] = [];
      const values: any[] = [];
      let paramCount = 1;

      if (validatedData.username !== undefined) {
        updateFields.push(`username = $${paramCount++}`);
        values.push(validatedData.username);
      }

      if (validatedData.first_name !== undefined) {
        updateFields.push(`first_name = $${paramCount++}`);
        values.push(validatedData.first_name);
      }

      if (validatedData.last_name !== undefined) {
        updateFields.push(`last_name = $${paramCount++}`);
        values.push(validatedData.last_name);
      }

      if (validatedData.is_active !== undefined) {
        updateFields.push(`is_active = $${paramCount++}`);
        values.push(validatedData.is_active);
      }

      if (validatedData.preferences !== undefined) {
        // Merge with existing preferences
        const updatedPreferences = {
          ...existingUser.preferences,
          ...validatedData.preferences,
        };
        updateFields.push(`preferences = $${paramCount++}`);
        values.push(JSON.stringify(updatedPreferences));
      }

      if (updateFields.length === 0) {
        this.logger.debug('No fields to update', { user_id: userId });
        return existingUser;
      }

      // Always update the updated_at timestamp
      updateFields.push(`updated_at = NOW()`);

      // Add user ID for WHERE clause
      values.push(userId);

      const query = `
        UPDATE users 
        SET ${updateFields.join(', ')}
        WHERE user_id = $${paramCount}
        RETURNING *
      `;

      const result = await db.query<User>(query, values);

      if (result.rows.length === 0) {
        throw new Error('Failed to update user');
      }

      const updatedUser = this.parseUserResult(result.rows[0]);
      this.logger.info('User updated successfully', {
        user_id: updatedUser.user_id,
      });

      return updatedUser;
    } catch (error) {
      this.logger.error('Failed to update user', {
        user_id: userId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Update user preferences only
   */
  async updateUserPreferences(
    userId: number,
    preferences: Partial<UserPreferences>,
  ): Promise<User> {
    this.logger.info('Updating user preferences', { user_id: userId });

    try {
      // Validate preferences
      const validatedPreferences =
        ValidationUtils.validateUserPreferences(preferences);

      return await this.updateUser(userId, {
        preferences: validatedPreferences,
      });
    } catch (error) {
      this.logger.error('Failed to update user preferences', {
        user_id: userId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Check if user exists by Telegram ID
   */
  async userExists(telegramId: number): Promise<boolean> {
    this.logger.debug('Checking if user exists', { telegram_id: telegramId });

    try {
      ValidationUtils.validateTelegramId(telegramId);

      const query = 'SELECT 1 FROM users WHERE telegram_id = $1 LIMIT 1';
      const result = await db.query(query, [telegramId]);

      const exists = result.rows.length > 0;
      this.logger.debug('User existence check completed', {
        telegram_id: telegramId,
        exists,
      });

      return exists;
    } catch (error) {
      this.logger.error('Failed to check user existence', {
        telegram_id: telegramId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Get all active users
   */
  async getActiveUsers(): Promise<User[]> {
    this.logger.debug('Getting all active users');

    try {
      const query =
        'SELECT * FROM users WHERE is_active = true ORDER BY created_at DESC';
      const result = await db.query<User>(query);

      const users = result.rows.map((row) => this.parseUserResult(row));
      this.logger.debug('Retrieved active users', { count: users.length });

      return users;
    } catch (error) {
      this.logger.error('Failed to get active users', {
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Deactivate user (soft delete)
   */
  async deactivateUser(userId: number): Promise<User> {
    this.logger.info('Deactivating user', { user_id: userId });

    try {
      return await this.updateUser(userId, { is_active: false });
    } catch (error) {
      this.logger.error('Failed to deactivate user', {
        user_id: userId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Reactivate user
   */
  async reactivateUser(userId: number): Promise<User> {
    this.logger.info('Reactivating user', { user_id: userId });

    try {
      return await this.updateUser(userId, { is_active: true });
    } catch (error) {
      this.logger.error('Failed to reactivate user', {
        user_id: userId,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Parse database result to User object (handles JSON parsing for preferences)
   */
  private parseUserResult(row: any): User {
    return {
      ...row,
      preferences:
        typeof row.preferences === 'string'
          ? JSON.parse(row.preferences)
          : row.preferences,
    };
  }
}

// Export singleton instance
export const userService = new UserService();
export default UserService;
