/**
 * TelegramBot - компонент для отправки уведомлений через Telegram Bot API
 */

import TelegramBot from 'node-telegram-bot-api';
import { createLogger } from '../utils/logger';
import { Logger } from 'winston';
import { User, Notification } from '../database/models';
import { channelService, ChannelService } from '../services/ChannelService';

type ChatState = 'awaiting_subscription_url';

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
  private chatStates: Map<number, ChatState> = new Map();
  private channelService: ChannelService;

  constructor(botConfig?: BotConfig) {
    this.logger = createLogger('TelegramBot');
    this.channelService = channelService;

    if (botConfig) {
      this.config = botConfig;
    } else {
      this.config = {
        token: process.env.BOT_TOKEN || '',
        webhookUrl: process.env.WEBHOOK_URL,
        polling: process.env.NODE_ENV !== 'production',
      };
    }

    // Создаем экземпляр бота
    this.bot = new TelegramBot(this.config.token, {
      polling: this.config.polling,
      webHook: this.config.webhookUrl
        ? { url: this.config.webhookUrl }
        : undefined,
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

    // Обработка callback_query
    this.bot.on('callback_query', (query) => {
      if (query.data) {
        this.handleCallbackQuery(query);
      }
    });

    // Обработка текстовых сообщений для состояний
    this.bot.on('message', (msg) => {
      // Убедимся, что это не команда
      if (msg.text && !msg.text.startsWith('/')) {
        this.handleStatefulMessage(msg);
      }
    });
  }

  private async handleStatefulMessage(msg: TelegramBot.Message): Promise<void> {
    const chatId = msg.chat.id;
    const state = this.chatStates.get(chatId);

    if (state === 'awaiting_subscription_url') {
      const url = msg.text;
      if (!url) {
        await this.bot.sendMessage(chatId, 'Пожалуйста, введите URL канала.');
        return;
      }

      await this.bot.sendMessage(chatId, '⏳ Проверяю канал...');
      const result = await this.channelService.subscribeUserToChannel(
        chatId,
        url,
      );

      if (result.success && result.data) {
        await this.bot.sendMessage(
          chatId,
          `✅ Вы успешно подписались на канал "${result.data.channel_name}"!`,
        );
      } else {
        await this.bot.sendMessage(
          chatId,
          `❌ Не удалось подписаться на канал. Ошибка: ${result.error}`,
        );
      }
      this.chatStates.delete(chatId);
    }
  }

  private async handleCallbackQuery(
    query: TelegramBot.CallbackQuery,
  ): Promise<void> {
    const chatId = query.message?.chat.id;
    const data = query.data;

    if (!chatId) {
      return;
    }

    this.logger.info(`Received callback_query: ${data}`, { chatId });
    await this.bot.answerCallbackQuery(query.id);

    switch (true) {
      case data === 'subscribe':
        this.chatStates.set(chatId, 'awaiting_subscription_url');
        await this.bot.sendMessage(
          chatId,
          'Пришлите мне ссылку на канал, который вы хотите добавить. Например: https://t.me/durov или @durov.',
        );
        break;
      case data === 'subscriptions':
        await this.sendSubscriptionsList(chatId);
        break;
      case data === 'settings':
        await this.sendSettingsMessage(chatId);
        break;
      case data?.startsWith('unsubscribe_'): {
        const channelId = parseInt(data.split('_')[1]);
        const result = await this.channelService.unsubscribeUserFromChannel(
          chatId,
          channelId,
        );
        if (result.success) {
          await this.bot.sendMessage(
            chatId,
            'Вы успешно отписались от канала.',
          );
          // Обновляем список подписок
          await this.sendSubscriptionsList(chatId);
        } else {
          await this.bot.sendMessage(chatId, `Ошибка: ${result.error}`);
        }
        break;
      }
    }
  }

  /**
   * Отправляет список подписок пользователю
   */
  private async sendSubscriptionsList(chatId: number): Promise<void> {
    const result = await this.channelService.getUserSubscriptions(chatId);

    if (!result.success || !result.data || result.data.length === 0) {
      await this.bot.sendMessage(
        chatId,
        'У вас пока нет активных подписок. Нажмите "Подписаться на канал", чтобы добавить новую.',
      );
      return;
    }

    const channels = result.data;
    let message = '<b>Ваши подписки:</b>\n\n';
    const inline_keyboard = [];

    for (const channel of channels) {
      message += `• ${this.escapeHtml(channel.channel_name)} (${this.escapeHtml(channel.channel_username || '')})\n`;
      inline_keyboard.push([
        {
          text: `❌ Отписаться от ${this.escapeHtml(channel.channel_name)}`,
          callback_data: `unsubscribe_${channel.channel_id}`,
        },
      ]);
    }

    const options: SendMessageOptions = {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard,
      },
    };

    await this.bot.sendMessage(chatId, message, options);
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

Используйте меню ниже для навигации.
    `.trim();

    const options: SendMessageOptions = {
      parse_mode: 'HTML',
      reply_markup: {
        inline_keyboard: [
          [
            { text: '➕ Подписаться на канал', callback_data: 'subscribe' },
            { text: '📝 Мои подписки', callback_data: 'subscriptions' },
          ],
          [{ text: '⚙️ Настройки', callback_data: 'settings' }],
        ],
      },
    };

    await this.bot.sendMessage(chatId, message, options);
  }

  /**
   * Отправляет справочное сообщение
   */
  private async sendHelpMessage(chatId: number): Promise<void> {
    const message = `
📋 <b>Справка по боту</b>

Я помогаю вам оставаться в курсе событий, собирая самые важные новости из ваших Telegram-каналов.

Вы можете управлять ботом с помощью меню, которое открывается по команде /start.

<b>Основные разделы меню:</b>
• <b>Подписаться на канал</b> - добавление нового канала для мониторинга.
• <b>Мои подписки</b> - просмотр и управление списком ваших подписок.
• <b>Настройки</b> - управление уведомлениями и другими параметрами.

Если у вас возникнут вопросы, вы всегда можете вызвать это сообщение снова командой /help.
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
