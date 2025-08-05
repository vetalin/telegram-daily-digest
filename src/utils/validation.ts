/**
 * Validation schemas and utilities for user data
 */

import { z } from 'zod';
import { UserPreferences } from '../database/models/User';

// Time format validation (HH:MM)
const timeSchema = z.string().regex(/^([01]?[0-9]|2[0-3]):[0-5][0-9]$/, {
  message: 'Time must be in HH:MM format (24-hour)',
});

// Telegram ID validation (must be positive integer)
const telegramIdSchema = z.number().int().positive({
  message: 'Telegram ID must be a positive integer',
});

// Username validation (optional, alphanumeric + underscore, 5-32 chars)
const usernameSchema = z
  .string()
  .regex(/^[a-zA-Z0-9_]{5,32}$/, {
    message:
      'Username must be 5-32 characters long and contain only letters, numbers, and underscores',
  })
  .optional();

// Name validation (1-64 characters, letters, spaces, hyphens)
const nameSchema = z
  .string()
  .regex(/^[a-zA-Zа-яА-Я\s-]{1,64}$/, {
    message:
      'Name must be 1-64 characters long and contain only letters, spaces, and hyphens',
  })
  .optional();

// Quiet hours validation
const quietHoursSchema = z
  .object({
    start: timeSchema,
    end: timeSchema,
  })
  .optional()
  .refine(
    (data) => {
      if (!data) return true;
      // Allow crossing midnight (e.g., 22:00 to 08:00)
      return true;
    },
    {
      message: 'Invalid quiet hours configuration',
    },
  );

// User preferences validation schema
export const userPreferencesSchema = z.object({
  notifications: z.boolean().default(true),
  digest_time: timeSchema.default('09:00'),
  categories: z.array(z.string().min(1).max(50)).default([]),
  keywords: z.array(z.string().min(1).max(100)).default([]),
  importance_threshold: z.number().int().min(0).max(100).default(50),
  quiet_hours: quietHoursSchema,
});

// Create user data validation schema
export const createUserSchema = z.object({
  telegram_id: telegramIdSchema,
  username: usernameSchema,
  first_name: nameSchema,
  last_name: nameSchema,
  preferences: userPreferencesSchema.partial().optional(),
});

// Update user data validation schema
export const updateUserSchema = z.object({
  username: usernameSchema,
  first_name: nameSchema,
  last_name: nameSchema,
  is_active: z.boolean().optional(),
  preferences: userPreferencesSchema.partial().optional(),
});

// Update user preferences validation schema
export const updateUserPreferencesSchema = userPreferencesSchema.partial();

// Validation utility functions
export class ValidationUtils {
  /**
   * Validates Telegram ID format and constraints
   */
  static validateTelegramId(telegramId: unknown): number {
    const result = telegramIdSchema.safeParse(telegramId);
    if (!result.success) {
      throw new Error(
        `Invalid Telegram ID: ${result.error.errors[0]?.message || 'Validation failed'}`,
      );
    }
    return result.data;
  }

  /**
   * Validates username format
   */
  static validateUsername(username: unknown): string | undefined {
    if (username === null || username === undefined) {
      return undefined;
    }

    const result = usernameSchema.safeParse(username);
    if (!result.success) {
      throw new Error(
        `Invalid username: ${result.error.errors[0]?.message || 'Validation failed'}`,
      );
    }
    return result.data;
  }

  /**
   * Validates time format (HH:MM)
   */
  static validateTime(time: unknown): string {
    const result = timeSchema.safeParse(time);
    if (!result.success) {
      throw new Error(
        `Invalid time format: ${result.error.errors[0]?.message || 'Validation failed'}`,
      );
    }
    return result.data;
  }

  /**
   * Validates user preferences with defaults
   */
  static validateUserPreferences(preferences: unknown): any {
    const result = userPreferencesSchema.partial().safeParse(preferences);
    if (!result.success) {
      throw new Error(
        `Invalid user preferences: ${result.error.errors.map((e) => e.message).join(', ')}`,
      );
    }
    return result.data;
  }

  /**
   * Validates complete user preferences (for full updates)
   */
  static validateCompleteUserPreferences(preferences: unknown): any {
    const result = userPreferencesSchema.safeParse(preferences);
    if (!result.success) {
      throw new Error(
        `Invalid user preferences: ${result.error.errors.map((e) => e.message).join(', ')}`,
      );
    }
    return result.data;
  }

  /**
   * Sanitizes string input by trimming whitespace
   */
  static sanitizeString(input: unknown): string | undefined {
    if (typeof input !== 'string') {
      return undefined;
    }
    const trimmed = input.trim();
    return trimmed.length > 0 ? trimmed : undefined;
  }

  /**
   * Validates array of keywords/categories
   */
  static validateStringArray(array: unknown, fieldName: string): string[] {
    if (!Array.isArray(array)) {
      throw new Error(`${fieldName} must be an array`);
    }

    const validated = array.map((item, index) => {
      if (typeof item !== 'string') {
        throw new Error(`${fieldName}[${index}] must be a string`);
      }
      const trimmed = item.trim();
      if (trimmed.length === 0) {
        throw new Error(`${fieldName}[${index}] cannot be empty`);
      }
      if (trimmed.length > 100) {
        throw new Error(`${fieldName}[${index}] cannot exceed 100 characters`);
      }
      return trimmed;
    });

    // Remove duplicates
    return [...new Set(validated)];
  }
}

// Export type definitions for convenience
export type CreateUserInput = z.infer<typeof createUserSchema>;
export type UpdateUserInput = z.infer<typeof updateUserSchema>;
export type UserPreferencesInput = z.infer<typeof userPreferencesSchema>;
