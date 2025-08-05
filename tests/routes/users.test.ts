/**
 * User routes integration tests
 */

import request from 'supertest';
import express from 'express';
import userRoutes from '../../src/routes/users';
import { userService } from '../../src/services/UserService';
import {
  errorHandler,
  notFoundHandler,
} from '../../src/middleware/errorHandler';
import { defaultUserPreferences } from '../../src/database/models/User';

// Mock UserService
jest.mock('../../src/services/UserService');
const mockUserService = userService as jest.Mocked<typeof userService>;

// Mock logger
jest.mock('../../src/utils/logger', () => ({
  default: {
    child: jest.fn(() => ({
      info: jest.fn(),
      debug: jest.fn(),
      warn: jest.fn(),
      error: jest.fn(),
    })),
  },
}));

// Setup test app
const createTestApp = () => {
  const app = express();
  app.use(express.json());
  app.use('/api/users', userRoutes);
  app.use(notFoundHandler);
  app.use(errorHandler);
  return app;
};

describe('User Routes', () => {
  let app: express.Application;

  beforeEach(() => {
    app = createTestApp();
    jest.clearAllMocks();
  });

  describe('POST /api/users/register', () => {
    const validUserData = {
      telegram_id: 123456789,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      preferences: {
        notifications: false,
        digest_time: '10:00',
      },
    };

    const mockCreatedUser = {
      user_id: 1,
      telegram_id: 123456789,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      is_active: true,
      preferences: {
        ...defaultUserPreferences,
        notifications: false,
        digest_time: '10:00',
      },
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should register a new user successfully', async () => {
      mockUserService.getUserByTelegramId.mockResolvedValue(null);
      mockUserService.createUser.mockResolvedValue(mockCreatedUser);

      const response = await request(app)
        .post('/api/users/register')
        .send(validUserData)
        .expect(201);

      expect(response.body.success).toBe(true);
      expect(response.body.data.telegram_id).toBe(123456789);
      expect(response.body.data.username).toBe('testuser');
      expect(response.body.message).toBe('User registered successfully');

      expect(mockUserService.getUserByTelegramId).toHaveBeenCalledWith(
        123456789,
      );
      expect(mockUserService.createUser).toHaveBeenCalledWith(validUserData);
    });

    it('should return 409 when user already exists', async () => {
      mockUserService.getUserByTelegramId.mockResolvedValue(mockCreatedUser);

      const response = await request(app)
        .post('/api/users/register')
        .send(validUserData)
        .expect(409);

      expect(response.body.error.message).toBe('User already exists');
      expect(response.body.error.code).toBe('CONFLICT');
      expect(mockUserService.createUser).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid telegram_id', async () => {
      const invalidData = { ...validUserData, telegram_id: -1 };

      const response = await request(app)
        .post('/api/users/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.error.message).toBe('Invalid input data');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for missing telegram_id', async () => {
      const { telegram_id, ...invalidData } = validUserData;

      const response = await request(app)
        .post('/api/users/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for invalid username format', async () => {
      const invalidData = { ...validUserData, username: 'a' }; // Too short

      const response = await request(app)
        .post('/api/users/register')
        .send(invalidData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('GET /api/users/profile/:telegramId', () => {
    const mockUser = {
      user_id: 1,
      telegram_id: 123456789,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      is_active: true,
      preferences: defaultUserPreferences,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should get user profile successfully', async () => {
      mockUserService.getUserByTelegramId.mockResolvedValue(mockUser);

      const response = await request(app)
        .get('/api/users/profile/123456789')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.telegram_id).toBe(123456789);
      expect(response.body.data.username).toBe('testuser');

      expect(mockUserService.getUserByTelegramId).toHaveBeenCalledWith(
        123456789,
      );
    });

    it('should return 404 when user not found', async () => {
      mockUserService.getUserByTelegramId.mockResolvedValue(null);

      const response = await request(app)
        .get('/api/users/profile/123456789')
        .expect(404);

      expect(response.body.error.message).toBe('User not found');
      expect(response.body.error.code).toBe('NOT_FOUND');
    });

    it('should return 400 for invalid telegram_id', async () => {
      const response = await request(app)
        .get('/api/users/profile/invalid')
        .expect(400);

      expect(response.body.error.message).toBe('Invalid Telegram ID');
      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });

    it('should return 400 for negative telegram_id', async () => {
      const response = await request(app)
        .get('/api/users/profile/-123')
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PUT /api/users/profile/:telegramId', () => {
    const mockUser = {
      user_id: 1,
      telegram_id: 123456789,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      is_active: true,
      preferences: defaultUserPreferences,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const updateData = {
      first_name: 'Updated',
      last_name: 'Name',
      preferences: { notifications: false },
    };

    it('should update user profile successfully', async () => {
      const updatedUser = {
        ...mockUser,
        first_name: updateData.first_name,
        last_name: updateData.last_name,
        preferences: { ...mockUser.preferences, ...updateData.preferences },
      };
      mockUserService.getUserByTelegramId.mockResolvedValue(mockUser);
      mockUserService.updateUser.mockResolvedValue(updatedUser);

      const response = await request(app)
        .put('/api/users/profile/123456789')
        .send(updateData)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.first_name).toBe('Updated');
      expect(response.body.message).toBe('Profile updated successfully');

      expect(mockUserService.getUserByTelegramId).toHaveBeenCalledWith(
        123456789,
      );
      expect(mockUserService.updateUser).toHaveBeenCalledWith(1, updateData);
    });

    it('should return 404 when user not found', async () => {
      mockUserService.getUserByTelegramId.mockResolvedValue(null);

      const response = await request(app)
        .put('/api/users/profile/123456789')
        .send(updateData)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(mockUserService.updateUser).not.toHaveBeenCalled();
    });

    it('should return 400 for invalid data', async () => {
      const invalidData = { first_name: 'a'.repeat(100) }; // Too long

      const response = await request(app)
        .put('/api/users/profile/123456789')
        .send(invalidData)
        .expect(400);

      expect(response.body.error.code).toBe('VALIDATION_ERROR');
    });
  });

  describe('PATCH /api/users/preferences/:telegramId', () => {
    const mockUser = {
      user_id: 1,
      telegram_id: 123456789,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      is_active: true,
      preferences: defaultUserPreferences,
      created_at: new Date(),
      updated_at: new Date(),
    };

    const preferencesUpdate = {
      notifications: false,
      digest_time: '08:00',
    };

    it('should update user preferences successfully', async () => {
      const updatedUser = {
        ...mockUser,
        preferences: { ...defaultUserPreferences, ...preferencesUpdate },
      };

      mockUserService.getUserByTelegramId.mockResolvedValue(mockUser);
      mockUserService.updateUserPreferences.mockResolvedValue(updatedUser);

      const response = await request(app)
        .patch('/api/users/preferences/123456789')
        .send(preferencesUpdate)
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.preferences.notifications).toBe(false);
      expect(response.body.data.preferences.digest_time).toBe('08:00');
      expect(response.body.message).toBe('Preferences updated successfully');

      expect(mockUserService.updateUserPreferences).toHaveBeenCalledWith(
        1,
        preferencesUpdate,
      );
    });

    it('should return 404 when user not found', async () => {
      mockUserService.getUserByTelegramId.mockResolvedValue(null);

      const response = await request(app)
        .patch('/api/users/preferences/123456789')
        .send(preferencesUpdate)
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
    });
  });

  describe('GET /api/users/check/:telegramId', () => {
    it('should return true when user exists', async () => {
      mockUserService.userExists.mockResolvedValue(true);

      const response = await request(app)
        .get('/api/users/check/123456789')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.exists).toBe(true);
      expect(response.body.data.telegram_id).toBe(123456789);

      expect(mockUserService.userExists).toHaveBeenCalledWith(123456789);
    });

    it('should return false when user does not exist', async () => {
      mockUserService.userExists.mockResolvedValue(false);

      const response = await request(app)
        .get('/api/users/check/123456789')
        .expect(200);

      expect(response.body.data.exists).toBe(false);
    });
  });

  describe('DELETE /api/users/profile/:telegramId', () => {
    const mockUser = {
      user_id: 1,
      telegram_id: 123456789,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      is_active: true,
      preferences: defaultUserPreferences,
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should deactivate user successfully', async () => {
      const deactivatedUser = { ...mockUser, is_active: false };

      mockUserService.getUserByTelegramId.mockResolvedValue(mockUser);
      mockUserService.deactivateUser.mockResolvedValue(deactivatedUser);

      const response = await request(app)
        .delete('/api/users/profile/123456789')
        .expect(200);

      expect(response.body.success).toBe(true);
      expect(response.body.data.is_active).toBe(false);
      expect(response.body.message).toBe('User deactivated successfully');

      expect(mockUserService.deactivateUser).toHaveBeenCalledWith(1);
    });

    it('should return 404 when user not found', async () => {
      mockUserService.getUserByTelegramId.mockResolvedValue(null);

      const response = await request(app)
        .delete('/api/users/profile/123456789')
        .expect(404);

      expect(response.body.error.code).toBe('NOT_FOUND');
      expect(mockUserService.deactivateUser).not.toHaveBeenCalled();
    });
  });

  describe('Error handling', () => {
    it('should handle service errors gracefully', async () => {
      mockUserService.getUserByTelegramId.mockRejectedValue(
        new Error('Database connection failed'),
      );

      const response = await request(app)
        .get('/api/users/profile/123456789')
        .expect(500);

      expect(response.body.error.code).toBe('DATABASE_ERROR');
    });

    it('should handle validation errors from service', async () => {
      mockUserService.createUser.mockRejectedValue(
        new Error(
          'Invalid Telegram ID: Telegram ID must be a positive integer',
        ),
      );

      const response = await request(app)
        .post('/api/users/register')
        .send({ telegram_id: 123456789, username: 'test' })
        .expect(500);

      expect(response.body.error).toBeDefined();
    });
  });
});
