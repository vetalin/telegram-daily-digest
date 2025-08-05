import { TelegramApi } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { Logger } from 'winston';
import { createLogger } from '../utils/logger';
import { SessionManager } from './SessionManager';

export interface UserbotConfig {
  apiId: number;
  apiHash: string;
  phoneNumber: string;
  sessionName: string;
  sessionPath?: string;
}

export interface TelegramChannel {
  id: string;
  title: string;
  username?: string;
  type: 'channel' | 'supergroup' | 'chat';
}

export interface TelegramMessage {
  id: number;
  text: string;
  date: Date;
  channelId: string;
  fromId?: string;
  views?: number;
}

export class TelegramUserbot {
  private client: TelegramApi;
  private logger: Logger;
  private config: UserbotConfig;
  private isConnected: boolean = false;
  private sessionManager: SessionManager;

  constructor(config: UserbotConfig) {
    this.config = config;
    this.logger = createLogger('TelegramUserbot');
    this.sessionManager = new SessionManager(
      config.sessionPath || './sessions',
    );

    // Инициализируем клиент с пустой сессией (будет загружена позже)
    this.client = new TelegramApi(
      new StringSession(''),
      config.apiId,
      config.apiHash,
      {
        connectionRetries: 5,
        floodSleepThreshold: 300,
        deviceModel: 'Daily Digest Bot',
        systemVersion: '1.0.0',
        appVersion: '1.0.0',
        langCode: 'ru',
        systemLangCode: 'ru-RU',
      },
    );
  }

  /**
   * Загружает сохраненную сессию из SessionManager
   */
  private async loadSession(): Promise<StringSession> {
    const session = await this.sessionManager.loadSession(
      this.config.sessionName,
    );
    if (session) {
      this.logger.info('Загружена сохраненная сессия');
      return session;
    } else {
      this.logger.info(
        'Сохраненная сессия не найдена, требуется новая аутентификация',
      );
      return new StringSession('');
    }
  }

  /**
   * Сохраняет сессию через SessionManager
   */
  private async saveSession(
    session: StringSession,
    userInfo?: any,
  ): Promise<void> {
    try {
      await this.sessionManager.saveSession(this.config.sessionName, session, {
        phoneNumber: this.config.phoneNumber,
        userId: userInfo?.id?.toString(),
        username: userInfo?.username,
        firstName: userInfo?.firstName,
        lastName: userInfo?.lastName,
      });
      this.logger.info(`Сессия сохранена: ${this.config.sessionName}`);
    } catch (error) {
      this.logger.error('Ошибка сохранения сессии:', error);
      throw error;
    }
  }

  /**
   * Подключается к Telegram API
   */
  async connect(): Promise<void> {
    try {
      this.logger.info('Подключение к Telegram API...');

      // Загружаем существующую сессию
      const session = await this.loadSession();
      this.client = new TelegramApi(
        session,
        this.config.apiId,
        this.config.apiHash,
        {
          connectionRetries: 5,
          floodSleepThreshold: 300,
          deviceModel: 'Daily Digest Bot',
          systemVersion: '1.0.0',
          appVersion: '1.0.0',
          langCode: 'ru',
          systemLangCode: 'ru-RU',
        },
      );

      // Подключаемся к Telegram
      await this.client.start({
        phoneNumber: this.config.phoneNumber,
        password: async () => {
          // Для 2FA аутентификации - можно расширить позже
          throw new Error(
            '2FA аутентификация не поддерживается в данной версии',
          );
        },
        phoneCode: async () => {
          throw new Error(
            'Требуется код подтверждения. Для первичной настройки используйте интерактивный режим.',
          );
        },
        onError: (err) => {
          this.logger.error('Ошибка аутентификации:', err);
          throw err;
        },
      });

      this.isConnected = true;
      this.logger.info('✅ Успешно подключен к Telegram API');

      // Получаем информацию о текущем пользователе
      const me = await this.client.getMe();
      this.logger.info(
        `Авторизован как: ${me.firstName} ${me.lastName || ''} (@${me.username || 'no_username'})`,
      );

      // Сохраняем сессию с информацией о пользователе
      await this.saveSession(this.client.session as StringSession, me);
    } catch (error) {
      this.logger.error('Ошибка подключения к Telegram API:', error);
      this.isConnected = false;
      throw error;
    }
  }

  /**
   * Отключается от Telegram API
   */
  async disconnect(): Promise<void> {
    try {
      if (this.client && this.isConnected) {
        await this.client.disconnect();
        this.isConnected = false;
        this.logger.info('Отключен от Telegram API');
      }
    } catch (error) {
      this.logger.error('Ошибка отключения:', error);
      throw error;
    }
  }

  /**
   * Проверяет статус подключения
   */
  isClientConnected(): boolean {
    return this.isConnected && this.client.connected;
  }

  /**
   * Получает клиент для прямого использования (для расширенных операций)
   */
  getClient(): TelegramApi {
    if (!this.isConnected) {
      throw new Error('Клиент не подключен. Вызовите connect() сначала.');
    }
    return this.client;
  }

  /**
   * Получает список каналов пользователя
   */
  async getChannels(): Promise<TelegramChannel[]> {
    if (!this.isConnected) {
      throw new Error('Клиент не подключен');
    }

    try {
      this.logger.info('Получение списка каналов...');

      const dialogs = await this.client.getDialogs({ limit: 100 });
      const channels: TelegramChannel[] = [];

      for (const dialog of dialogs) {
        const entity = dialog.entity;

        // Фильтруем только каналы и супергруппы
        if (entity.className === 'Channel' || entity.className === 'Chat') {
          channels.push({
            id: entity.id.toString(),
            title: entity.title || 'Без названия',
            username: entity.username,
            type: entity.broadcast
              ? 'channel'
              : entity.megagroup
                ? 'supergroup'
                : 'chat',
          });
        }
      }

      this.logger.info(`Найдено ${channels.length} каналов/групп`);
      return channels;
    } catch (error) {
      this.logger.error('Ошибка получения каналов:', error);
      throw error;
    }
  }

  /**
   * Получает менеджер сессий
   */
  getSessionManager(): SessionManager {
    return this.sessionManager;
  }

  /**
   * Удаляет текущую сессию
   */
  async deleteCurrentSession(): Promise<void> {
    try {
      await this.sessionManager.deleteSession(this.config.sessionName);
      this.logger.info(`Сессия ${this.config.sessionName} удалена`);
    } catch (error) {
      this.logger.error('Ошибка удаления сессии:', error);
      throw error;
    }
  }

  /**
   * Проверяет существование сессии
   */
  async hasValidSession(): Promise<boolean> {
    return await this.sessionManager.sessionExists(this.config.sessionName);
  }

  /**
   * Валидирует конфигурацию
   */
  static validateConfig(
    config: Partial<UserbotConfig>,
  ): config is UserbotConfig {
    const required = ['apiId', 'apiHash', 'phoneNumber', 'sessionName'];
    const missing = required.filter(
      (key) => !config[key as keyof UserbotConfig],
    );

    if (missing.length > 0) {
      throw new Error(
        `Отсутствуют обязательные параметры конфигурации: ${missing.join(', ')}`,
      );
    }

    if (typeof config.apiId !== 'number' || config.apiId <= 0) {
      throw new Error('apiId должен быть положительным числом');
    }

    if (!config.phoneNumber?.match(/^\+\d{10,15}$/)) {
      throw new Error(
        'phoneNumber должен быть в международном формате (например, +1234567890)',
      );
    }

    return true;
  }
}
