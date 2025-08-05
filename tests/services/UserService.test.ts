/**
 * UserService unit tests
 */

import { UserService } from '../../src/services/UserService';
import { db } from '../../src/database/connection';
import {
  defaultUserPreferences,
  CreateUserData,
  UpdateUserData,
} from '../../src/database/models/User';

// Mock database connection
jest.mock('../../src/database/connection');
const mockDb = db as jest.Mocked<typeof db>;

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

describe('UserService', () => {
  let userService: UserService;

  beforeEach(() => {
    userService = new UserService();
    jest.clearAllMocks();
  });

  describe('createUser', () => {
    const mockCreateUserData: CreateUserData = {
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
      preferences: JSON.stringify({
        ...defaultUserPreferences,
        notifications: false,
        digest_time: '10:00',
      }),
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should create a user successfully', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [mockCreatedUser],
        rowCount: 1,
      } as any);

      const result = await userService.createUser(mockCreateUserData);

      expect(mockDb.query).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO users'),
        expect.arrayContaining([
          123456789,
          'testuser',
          'Test',
          'User',
          true,
          expect.stringContaining('notifications'),
        ]),
      );

      expect(result.user_id).toBe(1);
      expect(result.telegram_id).toBe(123456789);
      expect(result.preferences.notifications).toBe(false);
      expect(result.preferences.digest_time).toBe('10:00');
    });

    it('should throw validation error for invalid telegram_id', async () => {
      const invalidData = { ...mockCreateUserData, telegram_id: -1 };

      await expect(userService.createUser(invalidData)).rejects.toThrow(
        'Invalid Telegram ID',
      );
    });

    it('should throw error when database insert fails', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      await expect(userService.createUser(mockCreateUserData)).rejects.toThrow(
        'Failed to create user',
      );
    });

    it('should merge preferences with defaults', async () => {
      const partialPreferences = { notifications: false };
      const userData = {
        ...mockCreateUserData,
        preferences: partialPreferences,
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [mockCreatedUser],
        rowCount: 1,
      } as any);

      await userService.createUser(userData);

      const callArgs = mockDb.query.mock.calls[0];
      const params = callArgs ? callArgs[1] : [];
      const preferencesJson = params && params[5] ? JSON.parse(params[5]) : {};

      expect(preferencesJson).toEqual({
        ...defaultUserPreferences,
        notifications: false,
      });
    });
  });

  describe('getUserByTelegramId', () => {
    const mockUser = {
      user_id: 1,
      telegram_id: 123456789,
      username: 'testuser',
      first_name: 'Test',
      last_name: 'User',
      is_active: true,
      preferences: JSON.stringify(defaultUserPreferences),
      created_at: new Date(),
      updated_at: new Date(),
    };

    it('should return user when found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      const result = await userService.getUserByTelegramId(123456789);

      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE telegram_id = $1',
        [123456789],
      );

      expect(result).toBeTruthy();
      expect(result?.user_id).toBe(1);
      expect(result?.telegram_id).toBe(123456789);
      expect(typeof result?.preferences).toBe('object');
    });

    it('should return null when user not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await userService.getUserByTelegramId(123456789);

      expect(result).toBeNull();
    });

    it('should throw validation error for invalid telegram_id', async () => {
      await expect(userService.getUserByTelegramId(-1)).rejects.toThrow(
        'Invalid Telegram ID',
      );
    });
  });

  describe('updateUser', () => {
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

    const updateData: UpdateUserData = {
      first_name: 'Updated',
      preferences: { notifications: false },
    };

    it('should update user successfully', async () => {
      // Mock getUserById
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { ...mockUser, preferences: JSON.stringify(mockUser.preferences) },
        ],
        rowCount: 1,
      } as any);

      // Mock update query
      const updatedUser = {
        ...mockUser,
        first_name: 'Updated',
        preferences: JSON.stringify({
          ...defaultUserPreferences,
          notifications: false,
        }),
      };

      mockDb.query.mockResolvedValueOnce({
        rows: [updatedUser],
        rowCount: 1,
      } as any);

      const result = await userService.updateUser(1, updateData);

      expect(result.first_name).toBe('Updated');
      expect(result.preferences.notifications).toBe(false);
    });

    it('should throw error when user not found', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      await expect(userService.updateUser(999, updateData)).rejects.toThrow(
        'User with ID 999 not found',
      );
    });

    it('should return existing user when no fields to update', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [
          { ...mockUser, preferences: JSON.stringify(mockUser.preferences) },
        ],
        rowCount: 1,
      } as any);

      const result = await userService.updateUser(1, {});

      expect(result).toEqual(mockUser);
      expect(mockDb.query).toHaveBeenCalledTimes(1); // Only getUserById call
    });
  });

  describe('userExists', () => {
    it('should return true when user exists', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [{ exists: true }],
        rowCount: 1,
      } as any);

      const result = await userService.userExists(123456789);

      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT 1 FROM users WHERE telegram_id = $1 LIMIT 1',
        [123456789],
      );

      expect(result).toBe(true);
    });

    it('should return false when user does not exist', async () => {
      mockDb.query.mockResolvedValueOnce({
        rows: [],
        rowCount: 0,
      } as any);

      const result = await userService.userExists(123456789);

      expect(result).toBe(false);
    });
  });

  describe('getActiveUsers', () => {
    it('should return all active users', async () => {
      const mockUsers = [
        {
          user_id: 1,
          telegram_id: 123456789,
          username: 'user1',
          is_active: true,
          preferences: JSON.stringify(defaultUserPreferences),
          created_at: new Date(),
          updated_at: new Date(),
        },
        {
          user_id: 2,
          telegram_id: 987654321,
          username: 'user2',
          is_active: true,
          preferences: JSON.stringify(defaultUserPreferences),
          created_at: new Date(),
          updated_at: new Date(),
        },
      ];

      mockDb.query.mockResolvedValueOnce({
        rows: mockUsers,
        rowCount: 2,
      } as any);

      const result = await userService.getActiveUsers();

      expect(mockDb.query).toHaveBeenCalledWith(
        'SELECT * FROM users WHERE is_active = true ORDER BY created_at DESC',
      );

      expect(result).toHaveLength(2);
      expect(result[0]?.user_id).toBe(1);
      expect(result[1]?.user_id).toBe(2);
    });
  });

  describe('deactivateUser', () => {
    it('should deactivate user successfully', async () => {
      const mockUser = {
        user_id: 1,
        telegram_id: 123456789,
        is_active: true,
        preferences: JSON.stringify(defaultUserPreferences),
        created_at: new Date(),
        updated_at: new Date(),
      };

      // Mock getUserById
      mockDb.query.mockResolvedValueOnce({
        rows: [mockUser],
        rowCount: 1,
      } as any);

      // Mock update query
      const deactivatedUser = { ...mockUser, is_active: false };
      mockDb.query.mockResolvedValueOnce({
        rows: [deactivatedUser],
        rowCount: 1,
      } as any);

      const result = await userService.deactivateUser(1);

      expect(result.is_active).toBe(false);
    });
  });
});
