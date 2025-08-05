/**
 * User routes - handles user registration and profile management endpoints
 */

import express, { Request, Response, NextFunction } from 'express';
import { userService } from '../services/UserService';
import { createUserSchema, updateUserSchema } from '../utils/validation';
import logger from '../utils/logger';
import { CreateUserData, UpdateUserData } from '../database/models/User';
import {
  asyncHandler,
  ValidationError,
  NotFoundError,
  ConflictError,
} from '../middleware/errorHandler';

const router = express.Router();
const routeLogger = logger.child({ module: 'UserRoutes' });

/**
 * POST /api/users/register
 * Register a new user
 */
router.post(
  '/register',
  asyncHandler(async (req: Request, res: Response) => {
    routeLogger.info('User registration attempt', {
      telegram_id: req.body.telegram_id,
      username: req.body.username,
    });

    // Validate request body
    const validationResult = createUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      throw new ValidationError('Invalid input data');
    }

    const userData = validationResult.data;

    // Check if user already exists
    const existingUser = await userService.getUserByTelegramId(
      userData.telegram_id,
    );
    if (existingUser) {
      routeLogger.warn('User registration failed - user already exists', {
        telegram_id: userData.telegram_id,
      });
      throw new ConflictError('User already exists');
    }

    // Create new user
    const newUser = await userService.createUser(userData);

    routeLogger.info('User registered successfully', {
      user_id: newUser.user_id,
      telegram_id: newUser.telegram_id,
    });

    // Return user data (without sensitive information)
    res.status(201).json({
      success: true,
      data: {
        user_id: newUser.user_id,
        telegram_id: newUser.telegram_id,
        username: newUser.username,
        first_name: newUser.first_name,
        last_name: newUser.last_name,
        is_active: newUser.is_active,
        preferences: newUser.preferences,
        created_at: newUser.created_at,
      },
      message: 'User registered successfully',
    });
  }),
);

/**
 * GET /api/users/profile/:telegramId
 * Get user profile by Telegram ID
 */
router.get(
  '/profile/:telegramId',
  asyncHandler(async (req: Request, res: Response) => {
    const telegramId = parseInt(req.params.telegramId || '0');

    if (isNaN(telegramId) || telegramId <= 0) {
      throw new ValidationError('Invalid Telegram ID');
    }

    routeLogger.debug('Getting user profile', { telegram_id: telegramId });

    const user = await userService.getUserByTelegramId(telegramId);
    if (!user) {
      throw new NotFoundError('User');
    }

    routeLogger.debug('User profile retrieved', {
      user_id: user.user_id,
      telegram_id: user.telegram_id,
    });

    res.json({
      success: true,
      data: {
        user_id: user.user_id,
        telegram_id: user.telegram_id,
        username: user.username,
        first_name: user.first_name,
        last_name: user.last_name,
        is_active: user.is_active,
        preferences: user.preferences,
        created_at: user.created_at,
        updated_at: user.updated_at,
      },
    });
  }),
);

/**
 * PUT /api/users/profile/:telegramId
 * Update user profile
 */
router.put(
  '/profile/:telegramId',
  asyncHandler(async (req: Request, res: Response) => {
    const telegramId = parseInt(req.params.telegramId || '0');

    if (isNaN(telegramId) || telegramId <= 0) {
      throw new ValidationError('Invalid Telegram ID');
    }

    routeLogger.info('User profile update attempt', {
      telegram_id: telegramId,
    });

    // Validate request body
    const validationResult = updateUserSchema.safeParse(req.body);
    if (!validationResult.success) {
      routeLogger.warn('Invalid update data', {
        telegram_id: telegramId,
        errors: validationResult.error.errors,
      });
      throw new ValidationError('Invalid input data');
    }

    const updateData = validationResult.data;

    // Get user by telegram ID first to get internal user_id
    const existingUser = await userService.getUserByTelegramId(telegramId);
    if (!existingUser) {
      throw new NotFoundError('User');
    }

    // Update user
    const updatedUser = await userService.updateUser(
      existingUser.user_id,
      updateData,
    );

    routeLogger.info('User profile updated successfully', {
      user_id: updatedUser.user_id,
      telegram_id: updatedUser.telegram_id,
    });

    res.json({
      success: true,
      data: {
        user_id: updatedUser.user_id,
        telegram_id: updatedUser.telegram_id,
        username: updatedUser.username,
        first_name: updatedUser.first_name,
        last_name: updatedUser.last_name,
        is_active: updatedUser.is_active,
        preferences: updatedUser.preferences,
        created_at: updatedUser.created_at,
        updated_at: updatedUser.updated_at,
      },
      message: 'Profile updated successfully',
    });
  }),
);

/**
 * PATCH /api/users/preferences/:telegramId
 * Update user preferences only
 */
router.patch(
  '/preferences/:telegramId',
  asyncHandler(async (req: Request, res: Response) => {
    const telegramId = parseInt(req.params.telegramId || '0');

    if (isNaN(telegramId) || telegramId <= 0) {
      throw new ValidationError('Invalid Telegram ID');
    }

    routeLogger.info('User preferences update attempt', {
      telegram_id: telegramId,
    });

    // Get user by telegram ID first to get internal user_id
    const existingUser = await userService.getUserByTelegramId(telegramId);
    if (!existingUser) {
      throw new NotFoundError('User');
    }

    // Update preferences
    const updatedUser = await userService.updateUserPreferences(
      existingUser.user_id,
      req.body,
    );

    routeLogger.info('User preferences updated successfully', {
      user_id: updatedUser.user_id,
      telegram_id: updatedUser.telegram_id,
    });

    res.json({
      success: true,
      data: {
        user_id: updatedUser.user_id,
        telegram_id: updatedUser.telegram_id,
        preferences: updatedUser.preferences,
        updated_at: updatedUser.updated_at,
      },
      message: 'Preferences updated successfully',
    });
  }),
);

/**
 * GET /api/users/check/:telegramId
 * Check if user exists
 */
router.get(
  '/check/:telegramId',
  asyncHandler(async (req: Request, res: Response) => {
    const telegramId = parseInt(req.params.telegramId || '0');

    if (isNaN(telegramId) || telegramId <= 0) {
      throw new ValidationError('Invalid Telegram ID');
    }

    routeLogger.debug('Checking user existence', { telegram_id: telegramId });

    const exists = await userService.userExists(telegramId);

    res.json({
      success: true,
      data: {
        telegram_id: telegramId,
        exists,
      },
    });
  }),
);

/**
 * DELETE /api/users/profile/:telegramId
 * Deactivate user (soft delete)
 */
router.delete(
  '/profile/:telegramId',
  asyncHandler(async (req: Request, res: Response) => {
    const telegramId = parseInt(req.params.telegramId || '0');

    if (isNaN(telegramId) || telegramId <= 0) {
      throw new ValidationError('Invalid Telegram ID');
    }

    routeLogger.info('User deactivation attempt', {
      telegram_id: telegramId,
    });

    // Get user by telegram ID first to get internal user_id
    const existingUser = await userService.getUserByTelegramId(telegramId);
    if (!existingUser) {
      throw new NotFoundError('User');
    }

    // Deactivate user
    const deactivatedUser = await userService.deactivateUser(
      existingUser.user_id,
    );

    routeLogger.info('User deactivated successfully', {
      user_id: deactivatedUser.user_id,
      telegram_id: deactivatedUser.telegram_id,
    });

    res.json({
      success: true,
      data: {
        user_id: deactivatedUser.user_id,
        telegram_id: deactivatedUser.telegram_id,
        is_active: deactivatedUser.is_active,
        updated_at: deactivatedUser.updated_at,
      },
      message: 'User deactivated successfully',
    });
  }),
);

export default router;
