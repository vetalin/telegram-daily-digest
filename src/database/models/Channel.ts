/**
 * Channel model - represents a Telegram channel being monitored
 */

export interface Channel {
  channel_id: number;
  telegram_channel_id: number;
  channel_name: string;
  channel_username?: string; // @username
  description?: string;
  is_active: boolean;
  created_at: Date;
  updated_at: Date;
}

export interface CreateChannelData {
  telegram_channel_id: number;
  channel_name: string;
  channel_username?: string;
  description?: string;
}

export interface UpdateChannelData {
  channel_name?: string;
  channel_username?: string;
  description?: string;
  is_active?: boolean;
}

export interface UserChannelSubscription {
  user_id: number;
  channel_id: number;
  subscribed_at: Date;
}
