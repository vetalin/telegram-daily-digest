import { StringSession } from 'telegram/sessions';
import { createLogger } from '../utils/logger';
import { Logger } from 'winston';
import fs from 'fs/promises';
import path from 'path';
import crypto from 'crypto';

export interface SessionInfo {
  sessionName: string;
  phoneNumber: string;
  userId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  createdAt: Date;
  lastUsed: Date;
  isActive: boolean;
}

export interface SessionMetadata {
  sessionName: string;
  phoneNumber: string;
  userId?: string;
  username?: string;
  firstName?: string;
  lastName?: string;
  createdAt: string;
  lastUsed: string;
  isActive: boolean;
  deviceInfo: {
    deviceModel: string;
    systemVersion: string;
    appVersion: string;
  };
}

export class SessionManager {
  private logger: Logger;
  private sessionsPath: string;
  private metadataPath: string;

  constructor(sessionsPath: string = './sessions') {
    this.logger = createLogger('SessionManager');
    this.sessionsPath = path.resolve(sessionsPath);
    this.metadataPath = path.join(this.sessionsPath, 'metadata.json');
  }

  /**
   * Инициализирует директорию для сессий
   */
  async initialize(): Promise<void> {
    try {
      await fs.mkdir(this.sessionsPath, { recursive: true });
      this.logger.info(
        `Директория сессий инициализирована: ${this.sessionsPath}`,
      );
    } catch (error) {
      this.logger.error('Ошибка создания директории сессий:', error);
      throw error;
    }
  }

  /**
   * Загружает сессию по имени
   */
  async loadSession(sessionName: string): Promise<StringSession | null> {
    try {
      const sessionPath = this.getSessionPath(sessionName);
      await fs.access(sessionPath);

      const sessionData = await fs.readFile(sessionPath, 'utf-8');
      await this.updateLastUsed(sessionName);

      this.logger.info(`Сессия загружена: ${sessionName}`);
      return new StringSession(sessionData.trim());
    } catch (error) {
      this.logger.info(`Сессия не найдена: ${sessionName}`);
      return null;
    }
  }

  /**
   * Сохраняет сессию
   */
  async saveSession(
    sessionName: string,
    session: StringSession,
    userInfo?: {
      phoneNumber: string;
      userId?: string;
      username?: string;
      firstName?: string;
      lastName?: string;
    },
  ): Promise<void> {
    try {
      await this.initialize();

      const sessionPath = this.getSessionPath(sessionName);
      const sessionData = session.save();

      // Сохраняем данные сессии
      await fs.writeFile(sessionPath, sessionData, 'utf-8');

      // Обновляем метаданные
      if (userInfo) {
        await this.updateMetadata(sessionName, userInfo);
      }

      this.logger.info(`Сессия сохранена: ${sessionName}`);
    } catch (error) {
      this.logger.error(`Ошибка сохранения сессии ${sessionName}:`, error);
      throw error;
    }
  }

  /**
   * Удаляет сессию
   */
  async deleteSession(sessionName: string): Promise<void> {
    try {
      const sessionPath = this.getSessionPath(sessionName);
      await fs.unlink(sessionPath);

      // Удаляем из метаданных
      await this.removeFromMetadata(sessionName);

      this.logger.info(`Сессия удалена: ${sessionName}`);
    } catch (error) {
      this.logger.error(`Ошибка удаления сессии ${sessionName}:`, error);
      throw error;
    }
  }

  /**
   * Получает список всех сессий
   */
  async listSessions(): Promise<SessionInfo[]> {
    try {
      const metadata = await this.loadMetadata();
      const sessions: SessionInfo[] = [];

      for (const [sessionName, meta] of Object.entries(metadata)) {
        // Проверяем существование файла сессии
        const sessionPath = this.getSessionPath(sessionName);
        const exists = await this.fileExists(sessionPath);

        sessions.push({
          sessionName,
          phoneNumber: meta.phoneNumber,
          userId: meta.userId,
          username: meta.username,
          firstName: meta.firstName,
          lastName: meta.lastName,
          createdAt: new Date(meta.createdAt),
          lastUsed: new Date(meta.lastUsed),
          isActive: exists && meta.isActive,
        });
      }

      return sessions.sort(
        (a, b) => b.lastUsed.getTime() - a.lastUsed.getTime(),
      );
    } catch (error) {
      this.logger.error('Ошибка получения списка сессий:', error);
      return [];
    }
  }

  /**
   * Проверяет существование сессии
   */
  async sessionExists(sessionName: string): Promise<boolean> {
    const sessionPath = this.getSessionPath(sessionName);
    return await this.fileExists(sessionPath);
  }

  /**
   * Очищает неактивные сессии старше указанного количества дней
   */
  async cleanupOldSessions(daysOld: number = 30): Promise<number> {
    try {
      const sessions = await this.listSessions();
      const cutoffDate = new Date(Date.now() - daysOld * 24 * 60 * 60 * 1000);
      let deletedCount = 0;

      for (const session of sessions) {
        if (session.lastUsed < cutoffDate && !session.isActive) {
          await this.deleteSession(session.sessionName);
          deletedCount++;
        }
      }

      this.logger.info(
        `Очищено ${deletedCount} старых сессий (старше ${daysOld} дней)`,
      );
      return deletedCount;
    } catch (error) {
      this.logger.error('Ошибка очистки старых сессий:', error);
      return 0;
    }
  }

  /**
   * Генерирует уникальное имя сессии на основе номера телефона
   */
  generateSessionName(phoneNumber: string): string {
    const hash = crypto
      .createHash('md5')
      .update(phoneNumber)
      .digest('hex')
      .substring(0, 8);
    const cleanPhone = phoneNumber.replace(/[^\d]/g, '');
    return `session_${cleanPhone}_${hash}`;
  }

  /**
   * Получает путь к файлу сессии
   */
  private getSessionPath(sessionName: string): string {
    return path.join(this.sessionsPath, `${sessionName}.session`);
  }

  /**
   * Проверяет существование файла
   */
  private async fileExists(filePath: string): Promise<boolean> {
    try {
      await fs.access(filePath);
      return true;
    } catch {
      return false;
    }
  }

  /**
   * Загружает метаданные сессий
   */
  private async loadMetadata(): Promise<{
    [sessionName: string]: SessionMetadata;
  }> {
    try {
      const exists = await this.fileExists(this.metadataPath);
      if (!exists) return {};

      const data = await fs.readFile(this.metadataPath, 'utf-8');
      return JSON.parse(data);
    } catch (error) {
      this.logger.warn(
        'Ошибка загрузки метаданных сессий, создается новый файл',
      );
      return {};
    }
  }

  /**
   * Сохраняет метаданные сессий
   */
  private async saveMetadata(metadata: {
    [sessionName: string]: SessionMetadata;
  }): Promise<void> {
    await fs.writeFile(
      this.metadataPath,
      JSON.stringify(metadata, null, 2),
      'utf-8',
    );
  }

  /**
   * Обновляет метаданные сессии
   */
  private async updateMetadata(
    sessionName: string,
    userInfo: {
      phoneNumber: string;
      userId?: string;
      username?: string;
      firstName?: string;
      lastName?: string;
    },
  ): Promise<void> {
    const metadata = await this.loadMetadata();
    const now = new Date().toISOString();

    metadata[sessionName] = {
      sessionName,
      phoneNumber: userInfo.phoneNumber,
      userId: userInfo.userId,
      username: userInfo.username,
      firstName: userInfo.firstName,
      lastName: userInfo.lastName,
      createdAt: metadata[sessionName]?.createdAt || now,
      lastUsed: now,
      isActive: true,
      deviceInfo: {
        deviceModel: 'Daily Digest Bot',
        systemVersion: '1.0.0',
        appVersion: '1.0.0',
      },
    };

    await this.saveMetadata(metadata);
  }

  /**
   * Обновляет время последнего использования сессии
   */
  private async updateLastUsed(sessionName: string): Promise<void> {
    const metadata = await this.loadMetadata();
    if (metadata[sessionName]) {
      metadata[sessionName].lastUsed = new Date().toISOString();
      await this.saveMetadata(metadata);
    }
  }

  /**
   * Удаляет сессию из метаданных
   */
  private async removeFromMetadata(sessionName: string): Promise<void> {
    const metadata = await this.loadMetadata();
    delete metadata[sessionName];
    await this.saveMetadata(metadata);
  }
}
