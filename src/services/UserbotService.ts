import { TelegramUserbot, UserbotConfig } from '../userbot';
import { createLogger } from '../utils/logger';
import { Logger } from 'winston';

export class UserbotService {
  private userbot: TelegramUserbot | null = null;
  private logger: Logger;
  private config: UserbotConfig;

  constructor() {
    this.logger = createLogger('UserbotService');
    this.config = this.loadConfigFromEnv();
  }

  /**
   * Загружает конфигурацию из переменных окружения
   */
  private loadConfigFromEnv(): UserbotConfig {
    const config = {
      apiId: parseInt(process.env.API_ID || '0'),
      apiHash: process.env.API_HASH || '',
      phoneNumber: process.env.PHONE_NUMBER || '',
      sessionName: process.env.SESSION_NAME || 'userbot_session',
      sessionPath: process.env.SESSION_PATH || './sessions',
    };

    // Валидируем конфигурацию
    TelegramUserbot.validateConfig(config);

    return config;
  }

  /**
   * Инициализирует и подключает userbot
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Инициализация Telegram Userbot...');

      this.userbot = new TelegramUserbot(this.config);
      await this.userbot.connect();

      this.logger.info('✅ Telegram Userbot успешно инициализирован');
    } catch (error) {
      this.logger.error('❌ Ошибка инициализации Telegram Userbot:', error);
      throw error;
    }
  }

  /**
   * Получает экземпляр userbot'а
   */
  getUserbot(): TelegramUserbot {
    if (!this.userbot) {
      throw new Error(
        'Userbot не инициализирован. Вызовите initialize() сначала.',
      );
    }
    return this.userbot;
  }

  /**
   * Проверяет статус подключения
   */
  isConnected(): boolean {
    return this.userbot?.isClientConnected() || false;
  }

  /**
   * Получает список доступных каналов
   */
  async getAvailableChannels() {
    if (!this.userbot) {
      throw new Error('Userbot не инициализирован');
    }

    return await this.userbot.getChannels();
  }

  /**
   * Безопасно отключает userbot
   */
  async shutdown(): Promise<void> {
    try {
      if (this.userbot) {
        await this.userbot.disconnect();
        this.userbot = null;
        this.logger.info('Telegram Userbot отключен');
      }
    } catch (error) {
      this.logger.error('Ошибка отключения userbot:', error);
    }
  }

  /**
   * Проверяет конфигурацию без инициализации
   */
  validateConfiguration(): { valid: boolean; errors: string[] } {
    const errors: string[] = [];

    try {
      TelegramUserbot.validateConfig(this.config);
      return { valid: true, errors: [] };
    } catch (error) {
      errors.push(
        error instanceof Error
          ? error.message
          : 'Неизвестная ошибка конфигурации',
      );
      return { valid: false, errors };
    }
  }

  /**
   * Запускает мониторинг каналов
   */
  async startChannelMonitoring(): Promise<void> {
    if (!this.userbot) {
      throw new Error('Userbot не инициализирован');
    }

    try {
      await this.userbot.startMonitoring();
      this.logger.info('✅ Мониторинг каналов запущен через сервис');
    } catch (error) {
      this.logger.error('❌ Ошибка запуска мониторинга через сервис:', error);
      throw error;
    }
  }

  /**
   * Останавливает мониторинг каналов
   */
  async stopChannelMonitoring(): Promise<void> {
    if (!this.userbot) {
      throw new Error('Userbot не инициализирован');
    }

    try {
      await this.userbot.stopMonitoring();
      this.logger.info('⏹️ Мониторинг каналов остановлен через сервис');
    } catch (error) {
      this.logger.error('❌ Ошибка остановки мониторинга через сервис:', error);
      throw error;
    }
  }

  /**
   * Добавляет канал в мониторинг
   */
  async addChannelToMonitoring(channelIdentifier: string): Promise<void> {
    if (!this.userbot) {
      throw new Error('Userbot не инициализирован');
    }

    try {
      await this.userbot.addChannelToMonitoring(channelIdentifier);
      this.logger.info(`Канал добавлен в мониторинг: ${channelIdentifier}`);
    } catch (error) {
      this.logger.error(`Ошибка добавления канала в мониторинг: ${channelIdentifier}`, error);
      throw error;
    }
  }

  /**
   * Удаляет канал из мониторинга
   */
  async removeChannelFromMonitoring(channelIdentifier: string): Promise<void> {
    if (!this.userbot) {
      throw new Error('Userbot не инициализирован');
    }

    try {
      await this.userbot.removeChannelFromMonitoring(channelIdentifier);
      this.logger.info(`Канал удален из мониторинга: ${channelIdentifier}`);
    } catch (error) {
      this.logger.error(`Ошибка удаления канала из мониторинга: ${channelIdentifier}`, error);
      throw error;
    }
  }

  /**
   * Получает список мониторимых каналов
   */
  getMonitoredChannels(): string[] {
    if (!this.userbot) {
      throw new Error('Userbot не инициализирован');
    }

    return this.userbot.getMonitoredChannels();
  }

  /**
   * Проверяет статус мониторинга
   */
  isMonitoringActive(): boolean {
    if (!this.userbot) {
      return false;
    }

    return this.userbot.isMonitoringActive();
  }

  /**
   * Инициализирует userbot и автоматически запускает мониторинг, если есть каналы
   */
  async initializeWithMonitoring(): Promise<void> {
    await this.initialize();

    // Если есть каналы для мониторинга, запускаем мониторинг
    const monitoredChannels = this.getMonitoredChannels();
    
    if (monitoredChannels.length > 0) {
      this.logger.info(`Найдено ${monitoredChannels.length} каналов для мониторинга, запускаем автоматически`);
      await this.startChannelMonitoring();
    } else {
      this.logger.info('Каналы для мониторинга не найдены, мониторинг не запущен');
    }
  }

  /**
   * Получает статистику мониторинга
   */
  getMonitoringStatus(): {
    isActive: boolean;
    channelsCount: number;
    channels: string[];
  } {
    if (!this.userbot) {
      return {
        isActive: false,
        channelsCount: 0,
        channels: [],
      };
    }

    const channels = this.getMonitoredChannels();
    
    return {
      isActive: this.isMonitoringActive(),
      channelsCount: channels.length,
      channels,
    };
  }
}

// Создаем singleton instance
export const userbotService = new UserbotService();
