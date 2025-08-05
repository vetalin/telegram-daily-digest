/**
 * Message model - represents a message from a Telegram channel
 */

export type MediaType =
  | 'text'
  | 'photo'
  | 'video'
  | 'document'
  | 'audio'
  | 'voice'
  | 'sticker'
  | 'animation';

export interface Message {
  message_id: number;
  telegram_message_id: number;
  channel_id: number;
  sender_id?: number; // Telegram user ID of sender
  content: string;
  media_type: MediaType;
  media_url?: string;
  is_filtered: boolean; // Passed content filters
  is_processed: boolean; // Processed by AI
  importance_score: number; // 0-100
  category?: string; // AI-generated category
  created_at: Date;
  updated_at: Date;
}

export interface CreateMessageData {
  telegram_message_id: number;
  channel_id: number;
  sender_id?: number;
  content: string;
  media_type: MediaType;
  media_url?: string;
}

export interface UpdateMessageData {
  content?: string;
  is_filtered?: boolean;
  is_processed?: boolean;
  importance_score?: number;
  category?: string;
}

export interface MessageAnalysis {
  importance_score: number;
  category: string;
  keywords: string[];
  sentiment: 'positive' | 'negative' | 'neutral';
  is_spam: boolean;
  is_ad: boolean;
}
