/**
 * Keyword model - represents user-defined keywords for content filtering
 */

export interface Keyword {
  keyword_id: number;
  user_id: number;
  keyword: string;
  weight: number; // 0.0 - 10.0, importance weight
  is_active: boolean;
  created_at: Date;
}

export interface CreateKeywordData {
  user_id: number;
  keyword: string;
  weight?: number;
}

export interface UpdateKeywordData {
  keyword?: string;
  weight?: number;
  is_active?: boolean;
}

export interface KeywordMatch {
  keyword: string;
  weight: number;
  positions: number[]; // Character positions in text where keyword was found
  score: number; // Calculated relevance score
}
