import { TelegramApi } from 'telegram';
import { StringSession } from 'telegram/sessions';
import { NewMessage } from 'telegram/events';
import { Logger } from 'winston';
import { createLogger } from '../utils/logger';
import { SessionManager } from './SessionManager';
import { channelDAO, messageDAO } from '../database/dao';
import { CreateMessageData, MediaType } from '../database/models';

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
  private monitoredChannels: Set<string> = new Set();
  private isMonitoring: boolean = false;

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

      // Загружаем мониторимые каналы из БД
      await this.loadMonitoredChannelsFromDB();
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
        // Останавливаем мониторинг перед отключением
        if (this.isMonitoring) {
          await this.stopMonitoring();
        }
        
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
   * Начинает мониторинг каналов на новые сообщения
   */
  async startMonitoring(): Promise<void> {
    if (!this.isConnected) {
      throw new Error('Клиент не подключен');
    }

    if (this.isMonitoring) {
      this.logger.info('Мониторинг уже запущен');
      return;
    }

    try {
      // Добавляем обработчик новых сообщений
      this.client.addEventHandler(this.handleNewMessage.bind(this), new NewMessage({}));

      this.isMonitoring = true;
      this.logger.info('✅ Мониторинг каналов запущен');
    } catch (error) {
      this.logger.error('Ошибка запуска мониторинга:', error);
      throw error;
    }
  }

  /**
   * Останавливает мониторинг каналов
   */
  async stopMonitoring(): Promise<void> {
    if (!this.isMonitoring) {
      this.logger.info('Мониторинг уже остановлен');
      return;
    }

    try {
      // Удаляем обработчики событий
      this.client.removeEventHandler(this.handleNewMessage.bind(this), new NewMessage({}));

      this.isMonitoring = false;
      this.logger.info('⏹️ Мониторинг каналов остановлен');
    } catch (error) {
      this.logger.error('Ошибка остановки мониторинга:', error);
      throw error;
    }
  }

  /**
   * Обработчик новых сообщений
   */
  private async handleNewMessage(event: any): Promise<void> {
    try {
      const message = event.message;
      const chat = await event.getChat();

      // Проверяем, что сообщение из мониторимого канала
      const channelId = chat.id.toString();
      if (!this.monitoredChannels.has(channelId)) {
        return;
      }

      this.logger.debug('Получено новое сообщение', {
        channelId,
        messageId: message.id,
        channelTitle: chat.title,
      });

      // Определяем тип медиа
      const mediaType = this.getMediaType(message);

      // Создаем данные для сохранения
      const messageData: CreateMessageData = {
        telegram_message_id: message.id,
        channel_id: await this.getOrCreateChannelId(chat),
        sender_id: message.senderId?.toJSNumber(),
        content: message.text || message.message || '',
        media_type: mediaType,
        media_url: await this.getMediaUrl(message),
      };

      // Сохраняем сообщение в базу данных
      const result = await messageDAO.create(messageData);

      if (result.success) {
        this.logger.info('Сообщение сохранено', {
          messageId: result.data?.message_id,
          channelTitle: chat.title,
          content: messageData.content.substring(0, 100) + (messageData.content.length > 100 ? '...' : ''),
        });
      } else {
        this.logger.error('Ошибка сохранения сообщения:', result.error);
      }
    } catch (error) {
      this.logger.error('Ошибка обработки нового сообщения:', error);
    }
  }

  /**
   * Добавляет канал в мониторинг
   */
  async addChannelToMonitoring(channelIdentifier: string): Promise<void> {
    try {
      // Получаем информацию о канале
      const entity = await this.client.getEntity(channelIdentifier);
      const channelId = entity.id.toString();

      // Добавляем в set мониторимых каналов
      this.monitoredChannels.add(channelId);

      // Сохраняем канал в базу данных, если его еще нет
      await this.getOrCreateChannelId(entity);

      this.logger.info(`Канал добавлен в мониторинг: ${entity.title} (${channelId})`);
    } catch (error) {
      this.logger.error(`Ошибка добавления канала в мониторинг: ${channelIdentifier}`, error);
      throw error;
    }
  }

  /**
   * Удаляет канал из мониторинга
   */
  async removeChannelFromMonitoring(channelIdentifier: string): Promise<void> {
    try {
      const entity = await this.client.getEntity(channelIdentifier);
      const channelId = entity.id.toString();

      this.monitoredChannels.delete(channelId);

      this.logger.info(`Канал удален из мониторинга: ${entity.title} (${channelId})`);
    } catch (error) {
      this.logger.error(`Ошибка удаления канала из мониторинга: ${channelIdentifier}`, error);
      throw error;
    }
  }

  /**
   * Получает список мониторимых каналов
   */
  getMonitoredChannels(): string[] {
    return Array.from(this.monitoredChannels);
  }

  /**
   * Проверяет статус мониторинга
   */
  isMonitoringActive(): boolean {
    return this.isMonitoring;
  }

  /**
   * Загружает список мониторимых каналов из базы данных
   */
  async loadMonitoredChannelsFromDB(): Promise<void> {
    try {
      const result = await channelDAO.getActiveChannels();
      
      if (result.data) {
        this.monitoredChannels.clear();
        
        for (const channel of result.data) {
          this.monitoredChannels.add(channel.telegram_channel_id.toString());
        }

        this.logger.info(`Загружено ${result.data.length} каналов для мониторинга из БД`);
      }
    } catch (error) {
      this.logger.error('Ошибка загрузки каналов из БД:', error);
    }
  }

  /**
   * Определяет тип медиа в сообщении
   */
  private getMediaType(message: any): MediaType {
    if (message.photo) return 'photo';
    if (message.video) return 'video';
    if (message.document) {
      if (message.document.mimeType?.startsWith('audio/')) return 'audio';
      if (message.document.mimeType?.startsWith('video/')) return 'animation';
      return 'document';
    }
    if (message.voice) return 'voice';
    if (message.sticker) return 'sticker';
    return 'text';
  }

  /**
   * Получает URL медиафайла, если есть
   */
  private async getMediaUrl(message: any): Promise<string | undefined> {
    try {
      if (message.photo || message.video || message.document) {
        // Здесь можно реализовать загрузку и сохранение медиафайлов
        // Пока возвращаем undefined
        return undefined;
      }
      return undefined;
    } catch (error) {
      this.logger.error('Ошибка получения URL медиафайла:', error);
      return undefined;
    }
  }

  /**
   * Получает ID канала из БД или создает новую запись
   */
  private async getOrCreateChannelId(chatEntity: any): Promise<number> {
    try {
      const telegramChannelId = chatEntity.id.toJSNumber();
      
      // Пытаемся найти существующий канал
      const existingChannel = await channelDAO.getByTelegramId(telegramChannelId);
      
      if (existingChannel.success && existingChannel.data) {
        return existingChannel.data.channel_id;
      }

      // Создаем новый канал, если не найден
      const newChannelResult = await channelDAO.create({
        telegram_channel_id: telegramChannelId,
        channel_name: chatEntity.title || 'Без названия',
        channel_username: chatEntity.username,
        description: chatEntity.about,
      });

      if (newChannelResult.success && newChannelResult.data) {
        return newChannelResult.data.channel_id;
      }

      throw new Error('Не удалось создать канал в БД');
    } catch (error) {
      this.logger.error('Ошибка получения/создания ID канала:', error);
      throw error;
    }
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
