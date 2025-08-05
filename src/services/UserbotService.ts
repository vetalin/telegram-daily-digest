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
}

// Создаем singleton instance
export const userbotService = new UserbotService();
