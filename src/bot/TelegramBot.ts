/**
 * TelegramBot - компонент для отправки уведомлений через Telegram Bot API
 */

import TelegramBot from 'node-telegram-bot-api';
import { createLogger } from '../utils/logger';
import { Logger } from 'winston';
import { User, Notification } from '../database/models';

export interface BotConfig {
  token: string;
  webhookUrl?: string;
  polling?: boolean;
}

export interface SendMessageOptions {
  parse_mode?: 'HTML' | 'Markdown' | 'MarkdownV2';
  disable_web_page_preview?: boolean;
  disable_notification?: boolean;
  reply_markup?: any;
}

export interface NotificationMessage {
  chatId: number;
  title?: string;
  content: string;
  options?: SendMessageOptions;
}

export interface SendResult {
  success: boolean;
  messageId?: number;
  error?: string;
}

export class TelegramBotService {
  private bot: TelegramBot;
  private logger: Logger;
  private config: BotConfig;
  private isInitialized: boolean = false;

import config from '../config';
// ...
  constructor(botConfig?: BotConfig) {
    this.logger = createLogger('TelegramBot');

    if (botConfig) {
      this.config = botConfig;
    } else {
      this.config = {
        token: config.botToken,
        webhookUrl: config.webhookUrl,
        polling: config.nodeEnv !== 'production',
      };
    }
// ...

    // Создаем экземпляр бота
    this.bot = new TelegramBot(this.config.token, {
      polling: this.config.polling,
      webHook: this.config.webhookUrl ? { url: this.config.webhookUrl } : undefined,
    });
  }

  /**
   * Инициализирует бота
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing Telegram Bot...');

      // Настраиваем webhook если не используем polling
      if (!this.config.polling && this.config.webhookUrl) {
        await this.bot.setWebHook(this.config.webhookUrl);
        this.logger.info('Webhook set successfully', {
          url: this.config.webhookUrl,
        });
      }

      // Получаем информацию о боте
      const botInfo = await this.bot.getMe();
      this.logger.info('Bot initialized successfully', {
        username: botInfo.username,
        firstName: botInfo.first_name,
        id: botInfo.id,
      });

      // Настраиваем обработчики команд
      this.setupCommandHandlers();

      this.isInitialized = true;
    } catch (error) {
      this.logger.error('Failed to initialize Telegram Bot', { error });
      throw error;
    }
  }

  /**
   * Настраивает обработчики команд
   */
  private setupCommandHandlers(): void {
    // Команда /start
    this.bot.onText(/\/start/, (msg) => {
      const chatId = msg.chat.id;
      this.sendWelcomeMessage(chatId);
    });

    // Команда /help
    this.bot.onText(/\/help/, (msg) => {
      const chatId = msg.chat.id;
      this.sendHelpMessage(chatId);
    });

    // Команда /settings
    this.bot.onText(/\/settings/, (msg) => {
      const chatId = msg.chat.id;
      this.sendSettingsMessage(chatId);
    });

    // Команда /notifications
    this.bot.onText(/\/notifications (.+)/, (msg, match) => {
      const chatId = msg.chat.id;
      const action = match?.[1];
      this.handleNotificationCommand(chatId, action);
    });

    // Обработка ошибок
    this.bot.on('polling_error', (error) => {
      this.logger.error('Polling error', { error });
    });

    this.bot.on('webhook_error', (error) => {
      this.logger.error('Webhook error', { error });
    });
  }

  /**
   * Отправляет уведомление пользователю
   */
  async sendNotification(
    notification: NotificationMessage,
  ): Promise<SendResult> {
    try {
      if (!this.isInitialized) {
        this.logger.warn('Bot not initialized, cannot send notification');
        return { success: false, error: 'Bot not initialized' };
      }

      this.logger.debug('Sending notification', {
        chatId: notification.chatId,
        title: notification.title,
      });

      // Формируем сообщение
      let message = '';
      if (notification.title) {
        message += `<b>${this.escapeHtml(notification.title)}</b>\n\n`;
      }
      message += this.escapeHtml(notification.content);

      // Настройки по умолчанию
      const options: SendMessageOptions = {
        parse_mode: 'HTML',
        disable_web_page_preview: true,
        ...notification.options,
      };

      // Отправляем сообщение
      const result = await this.bot.sendMessage(
        notification.chatId,
        message,
        options,
      );

      this.logger.info('Notification sent successfully', {
        chatId: notification.chatId,
        messageId: result.message_id,
      });

      return {
        success: true,
        messageId: result.message_id,
      };
    } catch (error) {
      this.logger.error('Failed to send notification', {
        error,
        chatId: notification.chatId,
      });

      return {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
      };
    }
  }

  /**
   * Отправляет множественные уведомления
   */
  async sendBulkNotifications(
    notifications: NotificationMessage[],
  ): Promise<SendResult[]> {
    const results: SendResult[] = [];

    this.logger.info('Sending bulk notifications', {
      count: notifications.length,
    });

    // Отправляем уведомления с интервалом для соблюдения rate limits
    for (const notification of notifications) {
      const result = await this.sendNotification(notification);
      results.push(result);

      // Небольшая задержка между отправками (Telegram rate limit: 30 msg/sec)
      if (notifications.length > 1) {
        await this.delay(100); // 100ms задержка
      }
    }

    const successCount = results.filter((r) => r.success).length;
    this.logger.info('Bulk notifications completed', {
      total: notifications.length,
      success: successCount,
      failed: notifications.length - successCount,
    });

    return results;
  }

  /**
   * Отправляет приветственное сообщение
   */
  private async sendWelcomeMessage(chatId: number): Promise<void> {
    const message = `
🤖 <b>Добро пожаловать в Daily Digest Bot!</b>

Я буду отправлять вам персонализированные дайджесты новостей и срочные уведомления.

<b>Что я умею:</b>
• 📰 Ежедневные дайджесты новостей
• 🚨 Мгновенные уведомления о важных событиях
• ⚙️ Настройка персональных предпочтений
• 🔕 Управление "тихими часами"

Используйте /help для получения списка команд.
    `.trim();

    await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  }

  /**
   * Отправляет справочное сообщение
   */
  private async sendHelpMessage(chatId: number): Promise<void> {
    const message = `
📋 <b>Доступные команды:</b>

/start - Приветственное сообщение
/help - Показать эту справку
/settings - Настройки уведомлений
/notifications on - Включить уведомления
/notifications off - Отключить уведомления

<b>Типы уведомлений:</b>
🚨 Критически важные (всегда приходят)
⚠️ Важные (приходят согласно настройкам)
📢 Срочные (зависят от ваших предпочтений)

Для настройки предпочтений используйте веб-интерфейс или команду /settings.
    `.trim();

    await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  }

  /**
   * Отправляет сообщение с настройками
   */
  private async sendSettingsMessage(chatId: number): Promise<void> {
    const message = `
⚙️ <b>Настройки уведомлений</b>

Для детальной настройки ваших предпочтений:
• Пороговое значение важности
• Категории интересов
• Тихие часы
• Частота дайджестов

Пожалуйста, используйте веб-интерфейс приложения.

<b>Быстрые команды:</b>
/notifications on - Включить уведомления
/notifications off - Отключить уведомления
    `.trim();

    await this.bot.sendMessage(chatId, message, { parse_mode: 'HTML' });
  }

  /**
   * Обрабатывает команды уведомлений
   */
  private async handleNotificationCommand(
    chatId: number,
    action?: string,
  ): Promise<void> {
    if (!action) {
      await this.bot.sendMessage(
        chatId,
        'Используйте: /notifications on или /notifications off',
      );
      return;
    }

    const message =
      action.toLowerCase() === 'on'
        ? '✅ Уведомления включены'
        : action.toLowerCase() === 'off'
          ? '🔕 Уведомления отключены'
          : 'Неизвестная команда. Используйте: /notifications on или /notifications off';

    await this.bot.sendMessage(chatId, message);
  }

  /**
   * Проверяет, доступен ли чат для отправки сообщений
   */
  async isChatAccessible(chatId: number): Promise<boolean> {
    try {
      await this.bot.getChat(chatId);
      return true;
    } catch (error) {
      this.logger.warn('Chat is not accessible', { chatId, error });
      return false;
    }
  }

  /**
   * Получает информацию о чате
   */
  async getChatInfo(chatId: number) {
    try {
      return await this.bot.getChat(chatId);
    } catch (error) {
      this.logger.error('Failed to get chat info', { chatId, error });
      return null;
    }
  }

  /**
   * Экранирует HTML символы
   */
  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#x27;');
  }

  /**
   * Задержка выполнения
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Останавливает бота
   */
  async stop(): Promise<void> {
    try {
      if (this.config.polling) {
        await this.bot.stopPolling();
      }
      this.logger.info('Bot stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping bot', { error });
    }
  }

  /**
   * Получает экземпляр бота (для расширенного использования)
   */
  getBotInstance(): TelegramBot {
    return this.bot;
  }

  /**
   * Проверяет, инициализирован ли бот
   */
  isReady(): boolean {
    return this.isInitialized;
  }
}
