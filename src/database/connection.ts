/**
 * Database connection configuration and utilities
 */

import { Pool, PoolConfig, QueryResult } from 'pg';
import logger from '../utils/logger';

export interface DatabaseConfig {
  host: string;
  port: number;
  database: string;
  user: string;
  password: string;
  ssl?: boolean;
  max?: number; // Maximum number of clients in pool
  idleTimeoutMillis?: number;
  connectionTimeoutMillis?: number;
}

class DatabaseConnection {
  private pool: Pool | null = null;
  private config: DatabaseConfig;

  constructor(config: DatabaseConfig) {
    this.config = config;
  }

  /**
   * Initialize database connection pool
   */
  async connect(): Promise<void> {
    try {
      const poolConfig: PoolConfig = {
        host: this.config.host,
        port: this.config.port,
        database: this.config.database,
        user: this.config.user,
        password: this.config.password,
        ssl: this.config.ssl,
        max: this.config.max || 20,
        idleTimeoutMillis: this.config.idleTimeoutMillis || 30000,
        connectionTimeoutMillis: this.config.connectionTimeoutMillis || 2000,
      };

      this.pool = new Pool(poolConfig);

      // Test connection
      const client = await this.pool.connect();
      await client.query('SELECT NOW()');
      client.release();

      logger.info('Database connected successfully');
    } catch (error) {
      logger.error('Failed to connect to database:', error);
      throw error;
    }
  }

  /**
   * Execute a query
   */
  async query<T = any>(text: string, params?: any[]): Promise<QueryResult<T>> {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    try {
      const start = Date.now();
      const result = await this.pool.query<T>(text, params);
      const duration = Date.now() - start;

      logger.debug(`Query executed in ${duration}ms`, {
        query: text,
        params,
        rowCount: result.rowCount,
      });

      return result;
    } catch (error) {
      logger.error('Query execution failed:', {
        query: text,
        params,
        error: error instanceof Error ? error.message : error,
      });
      throw error;
    }
  }

  /**
   * Execute a transaction
   */
  async transaction<T>(
    callback: (
      query: (text: string, params?: any[]) => Promise<QueryResult>,
    ) => Promise<T>,
  ): Promise<T> {
    if (!this.pool) {
      throw new Error('Database not connected. Call connect() first.');
    }

    const client = await this.pool.connect();

    try {
      await client.query('BEGIN');

      const queryWrapper = (text: string, params?: any[]) =>
        client.query(text, params);
      const result = await callback(queryWrapper);

      await client.query('COMMIT');
      return result;
    } catch (error) {
      await client.query('ROLLBACK');
      throw error;
    } finally {
      client.release();
    }
  }

  /**
   * Close database connection
   */
  async disconnect(): Promise<void> {
    if (this.pool) {
      await this.pool.end();
      this.pool = null;
      logger.info('Database connection closed');
    }
  }

  /**
   * Get pool status
   */
  getStatus() {
    if (!this.pool) {
      return { connected: false };
    }

    return {
      connected: true,
      totalCount: this.pool.totalCount,
      idleCount: this.pool.idleCount,
      waitingCount: this.pool.waitingCount,
    };
  }
}

// Default database configuration from environment variables
const getDefaultConfig = (): DatabaseConfig => ({
  host: process.env.DB_HOST || 'localhost',
  port: parseInt(process.env.DB_PORT || '5432'),
  database: process.env.DB_NAME || 'telegram_digest',
  user: process.env.DB_USER || 'postgres',
  password: process.env.DB_PASSWORD || '',
  ssl: process.env.DB_SSL === 'true',
  max: parseInt(process.env.DB_POOL_MAX || '20'),
  idleTimeoutMillis: parseInt(process.env.DB_IDLE_TIMEOUT || '30000'),
  connectionTimeoutMillis: parseInt(
    process.env.DB_CONNECTION_TIMEOUT || '2000',
  ),
});

// Export singleton instance
export const db = new DatabaseConnection(getDefaultConfig());

export default DatabaseConnection;
