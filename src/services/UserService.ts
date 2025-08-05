/**
 * UserService - handles all user-related business logic
 */

import {
  User,
  CreateUserData,
  UpdateUserData,
  UserPreferences,
} from '../database/models/User';
import { userDAO, UserDAO } from '../database/dao/UserDAO';
import {
  createUserSchema,
  updateUserSchema,
  ValidationUtils,
} from '../utils/validation';
import { createLogger } from '../utils/logger';
import { Logger } from 'winston';

export class UserService {
  private readonly logger: Logger;
  private dao: UserDAO;

  constructor(dao: UserDAO = userDAO) {
    this.logger = createLogger('UserService');
    this.dao = dao;
  }

  /**
   * Create a new user
   */
  async createUser(userData: CreateUserData): Promise<User> {
    this.logger.info('Creating new user', {
      telegram_id: userData.telegram_id,
    });
    try {
      const validatedData = createUserSchema.parse(userData);
      const result = await this.dao.create(validatedData);
      if (!result.success || !result.data) {
        throw new Error(result.error || 'Failed to create user');
      }
      this.logger.info('User created successfully', {
        user_id: result.data.user_id,
      });
      return result.data;
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
      ValidationUtils.validateTelegramId(telegramId);
      const result = await this.dao.findByTelegramId(telegramId);
      return result.data || null;
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
      const result = await this.dao.findById(userId);
      return result.data || null;
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
      const validatedData = updateUserSchema.parse(updateData);
      const result = await this.dao.update(userId, validatedData);

      if (!result.success || !result.data) {
        throw new Error(
          result.error ||
            `User with ID ${userId} not found or failed to update.`,
        );
      }

      this.logger.info('User updated successfully', {
        user_id: result.data.user_id,
      });
      return result.data;
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
      const user = await this.getUserByTelegramId(telegramId);
      return !!user;
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
      const result = await this.dao.getActiveUsers();
      if (!result.success || !result.data) {
        return [];
      }
      return result.data;
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
    return this.updateUser(userId, { is_active: false });
  }

  /**
   * Reactivate user
   */
  async reactivateUser(userId: number): Promise<User> {
    return this.updateUser(userId, { is_active: true });
  }
}

// Export singleton instance
export const userService = new UserService();
export default UserService;
