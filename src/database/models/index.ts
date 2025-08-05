/**
 * Database models index - exports all model types and interfaces
 */

// User-related exports
export * from './User';

// Channel-related exports
export * from './Channel';

// Message-related exports
export * from './Message';

// Digest-related exports
export * from './Digest';

// Notification-related exports
export * from './Notification';

// Keyword-related exports
export * from './Keyword';

// Common database result types
export interface DatabaseResult<T = any> {
  success: boolean;
  data?: T;
  error?: string;
  affected_rows?: number;
}

export interface PaginationOptions {
  page: number;
  limit: number;
  offset?: number;
}

export interface PaginatedResult<T> {
  data: T[];
  total: number;
  page: number;
  limit: number;
  total_pages: number;
}

// Common query filters
export interface DateFilter {
  start_date?: Date;
  end_date?: Date;
}

export interface SearchFilter {
  query?: string;
  fields?: string[];
}
