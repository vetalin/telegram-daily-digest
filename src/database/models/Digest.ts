/**
 * Digest model - represents a daily digest summary for a user
 */

export interface Digest {
  digest_id: number;
  user_id: number;
  digest_date: Date;
  title?: string;
  content: string;
  summary?: string; // Short summary
  message_count: number;
  created_at: Date;
  updated_at: Date;
}

export interface CreateDigestData {
  user_id: number;
  digest_date: Date;
  title?: string;
  content: string;
  summary?: string;
  message_count: number;
}

export interface UpdateDigestData {
  title?: string;
  content?: string;
  summary?: string;
  message_count?: number;
}

export interface DigestMessage {
  digest_id: number;
  message_id: number;
}

export interface DigestGenerationOptions {
  user_id: number;
  date: Date;
  max_messages?: number;
  min_importance_score?: number;
  categories?: string[];
}
