/**
 * User model - represents a user in the Telegram Daily Digest system
 */

export interface UserPreferences {
  notifications: boolean;
  digest_time: string; // Format: "HH:MM"
  categories: string[];
  keywords: string[];
  importance_threshold: number; // 0-100
  quiet_hours?: {
    start: string; // Format: "HH:MM"
    end: string; // Format: "HH:MM"
  };
}

export interface User {
  user_id: number;
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  is_active: boolean;
  preferences: UserPreferences;
  created_at: Date;
  updated_at: Date;
}

export interface CreateUserData {
  telegram_id: number;
  username?: string;
  first_name?: string;
  last_name?: string;
  preferences?: Partial<UserPreferences>;
}

export interface UpdateUserData {
  username?: string;
  first_name?: string;
  last_name?: string;
  is_active?: boolean;
  preferences?: Partial<UserPreferences>;
}

export const defaultUserPreferences: UserPreferences = {
  notifications: true,
  digest_time: '09:00',
  categories: [],
  keywords: [],
  importance_threshold: 50,
  quiet_hours: {
    start: '22:00',
    end: '08:00',
  },
};
