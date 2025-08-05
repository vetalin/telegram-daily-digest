/**
 * DigestDAO - Data Access Object для работы с дайджестами
 */

import { db } from '../connection';
import { Digest, CreateDigestData, DatabaseResult, Message } from '../models';
import { Logger } from 'winston';
import { createLogger } from '../../utils/logger';

export class DigestDAO {
  private logger: Logger;

  constructor() {
    this.logger = createLogger('DigestDAO');
  }

  /**
   * Создает новый дайджест
   */
  async create(data: CreateDigestData): Promise<DatabaseResult<Digest>> {
    try {
      const query = `
        INSERT INTO digests (user_id, digest_date, title, content, summary, message_count)
        VALUES ($1, $2, $3, $4, $5, $6)
        ON CONFLICT (user_id, digest_date) DO UPDATE SET
          title = EXCLUDED.title,
          content = EXCLUDED.content,
          summary = EXCLUDED.summary,
          message_count = EXCLUDED.message_count,
          updated_at = CURRENT_TIMESTAMP
        RETURNING *
      `;

      const values = [
        data.user_id,
        data.digest_date,
        data.title,
        data.content,
        data.summary,
        data.message_count,
      ];

      const result = await db.query<Digest>(query, values);

      this.logger.info(
        `Дайджест создан или обновлен для пользователя ${data.user_id} на дату ${data.digest_date}`,
      );

      return {
        success: true,
        data: result.rows[0],
        affected_rows: result.rowCount || 0,
      };
    } catch (error) {
      this.logger.error('Ошибка создания или обновления дайджеста:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Добавляет сообщение в дайджест
   */
  async addMessageToDigest(
    digestId: number,
    messageId: number,
  ): Promise<DatabaseResult<void>> {
    try {
      const query = `
        INSERT INTO digest_messages (digest_id, message_id)
        VALUES ($1, $2)
        ON CONFLICT (digest_id, message_id) DO NOTHING
      `;
      const result = await db.query(query, [digestId, messageId]);

      return {
        success: true,
        affected_rows: result.rowCount || 0,
      };
    } catch (error) {
      this.logger.error('Ошибка добавления сообщения в дайджест:', {
        digestId,
        messageId,
        error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }

  /**
   * Получает сообщения для дайджеста пользователя за определенный день
   */
  async getMessagesForUserDigest(
    userId: number,
    date: Date,
  ): Promise<DatabaseResult<Message[]>> {
    try {
      const query = `
            SELECT m.*
            FROM messages m
            JOIN user_channels uc ON m.channel_id = uc.channel_id
            WHERE uc.user_id = $1
              AND m.created_at::date = $2::date
              AND m.is_processed = true -- Выбираем только обработанные AI сообщения
            ORDER BY m.importance_score DESC, m.created_at DESC;
        `;
      const values = [userId, date];
      const result = await db.query<Message>(query, values);

      return {
        success: true,
        data: result.rows,
      };
    } catch (error) {
      this.logger.error('Ошибка получения сообщений для дайджеста:', {
        userId,
        date,
        error,
      });
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
        data: [],
      };
    }
  }
}

export const digestDAO = new DigestDAO();
