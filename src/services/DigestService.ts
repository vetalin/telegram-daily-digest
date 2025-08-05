/**
 * DigestService - сервис для создания и рассылки ежедневных дайджестов
 */
import cron from 'node-cron';
import { userService, UserService } from './UserService';
import { digestDAO, DigestDAO } from '../database/dao/DigestDAO';
import { Message, User } from '../database/models';
import { createLogger } from '../utils/logger';
import { Logger } from 'winston';
import { NotificationSender } from './NotificationSender';
import { TelegramBotService } from '../bot/TelegramBot';

export class DigestService {
  private logger: Logger;
  private userService: UserService;
  private digestDAO: DigestDAO;
  private notificationSender: NotificationSender;

  constructor() {
    this.logger = createLogger('DigestService');
    this.userService = userService;
    this.digestDAO = digestDAO;

    // Мы должны инициализировать TelegramBotService, чтобы передать его в NotificationSender
    const telegramBot = new TelegramBotService();
    this.notificationSender = new NotificationSender(telegramBot);
  }

  /**
   * Запускает ежедневное создание дайджестов
   */
  public scheduleDailyDigest(cronTime: string = '0 8 * * *') {
    // 8:00 AM every day
    this.logger.info(`Дайджесты будут создаваться ежедневно в ${cronTime}`);
    cron.schedule(cronTime, () => {
      this.logger.info('Начинаю создание ежедневных дайджестов...');
      this.generateDailyDigests().catch((error) => {
        this.logger.error('Ошибка при создании ежедневных дайджестов:', error);
      });
    });
  }

  /**
   * Генерирует дайджесты для всех активных пользователей
   */
  public async generateDailyDigests(): Promise<void> {
    const users = await this.userService.getActiveUsers();
    if (!users.length) {
      this.logger.info('Нет активных пользователей для создания дайджестов.');
      return;
    }

    this.logger.info(
      `Начинаю генерацию дайджестов для ${users.length} пользователей.`,
    );

    for (const user of users) {
      try {
        await this.generateDigestForUser(user);
      } catch (error) {
        this.logger.error(
          `Ошибка при создании дайджеста для пользователя ${user.user_id}:`,
          error,
        );
      }
    }
  }

  /**
   * Генерирует дайджест для одного пользователя
   */
  public async generateDigestForUser(user: User): Promise<void> {
    const today = new Date();
    const messagesResult = await this.digestDAO.getMessagesForUserDigest(
      user.user_id,
      today,
    );

    if (
      !messagesResult.success ||
      !messagesResult.data ||
      messagesResult.data.length === 0
    ) {
      this.logger.info(
        `Нет сообщений для дайджеста для пользователя ${user.user_id} за ${today.toDateString()}`,
      );
      return;
    }

    const messages = messagesResult.data;
    const groupedMessages = this.groupMessagesByCategory(messages);
    const digestContent = this.formatDigest(groupedMessages);
    const digestTitle = `Ежедневный дайджест новостей за ${today.toLocaleDateString('ru-RU')}`;

    // Создаем запись в БД
    const digestResult = await this.digestDAO.create({
      user_id: user.user_id,
      digest_date: today,
      title: digestTitle,
      content: digestContent,
      summary: `Дайджест содержит ${messages.length} сообщений.`,
      message_count: messages.length,
    });

    if (!digestResult.success || !digestResult.data) {
      throw new Error('Не удалось создать запись дайджеста в БД');
    }

    const digestId = digestResult.data.digest_id;

    // Привязываем сообщения к дайджесту
    for (const message of messages) {
      await this.digestDAO.addMessageToDigest(digestId, message.message_id);
    }

    this.logger.info(
      `Дайджест для пользователя ${user.user_id} успешно создан.`,
    );

    // Отправляем дайджест пользователю
    await this.notificationSender.sendNotification({
      notification_id: 0, // Это поле не используется в sendViaTelegram напрямую
      user_id: user.user_id,
      notification_type: 'digest',
      title: digestTitle,
      content: digestContent,
      is_sent: false,
      created_at: new Date(),
      updated_at: new Date(),
    });

    this.logger.info(`Дайджест отправлен пользователю ${user.user_id}.`);
  }

  /**
   * Группирует сообщения по категориям
   */
  private groupMessagesByCategory(messages: Message[]): Map<string, Message[]> {
    const grouped = new Map<string, Message[]>();
    for (const message of messages) {
      const category = message.category || 'Без категории';
      if (!grouped.has(category)) {
        grouped.set(category, []);
      }
      grouped.get(category)!.push(message);
    }
    return grouped;
  }

  /**
   * Форматирует сгруппированные сообщения в текстовый дайджест
   */
  private formatDigest(groupedMessages: Map<string, Message[]>): string {
    let content = '<b>Ваш ежедневный дайджест новостей:</b>\n\n';
    for (const [category, messages] of groupedMessages.entries()) {
      content += `<b>${this.escapeHtml(category)}</b>\n`;
      for (const message of messages) {
        const title = message.content.substring(0, 100).replace(/\n/g, ' ');
        // В реальном приложении ссылка должна вести на само сообщение, если это возможно
        content += `• <i>(${message.importance_score})</i> ${this.escapeHtml(title)}...\n`;
      }
      content += '\n';
    }
    return content;
  }

  private escapeHtml(text: string): string {
    return text
      .replace(/&/g, '&amp;')
      .replace(/</g, '&lt;')
      .replace(/>/g, '&gt;')
      .replace(/"/g, '&quot;')
      .replace(/'/g, '&#039;');
  }
}

export const digestService = new DigestService();
