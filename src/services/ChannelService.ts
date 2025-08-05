/**
 * ChannelService - сервис для управления каналами и подписками
 */

import { channelDAO, ChannelDAO } from '../database/dao/ChannelDAO';
import { userDAO, UserDAO } from '../database/dao/UserDAO';
import { TelegramUserbot } from '../userbot/TelegramUserbot';
import {
  Channel,
  CreateChannelData,
  DatabaseResult,
  User,
} from '../database/models';
import { createLogger, Logger } from '../utils/logger';
import { parseTelegramChannelUrl } from '../utils/validation';

export class ChannelService {
  private logger: Logger;

  constructor(
    private channels: ChannelDAO,
    private users: UserDAO,
    private userbot: TelegramUserbot,
  ) {
    this.logger = createLogger('ChannelService');
  }

  /**
   * Подписывает пользователя на канал по URL
   */
  async subscribeUserToChannel(
    telegramUserId: number,
    channelUrl: string,
  ): Promise<DatabaseResult<Channel>> {
    this.logger.info(
      `Попытка подписки пользователя ${telegramUserId} на канал ${channelUrl}`,
    );

    // 1. Валидация URL
    const channelUsername = parseTelegramChannelUrl(channelUrl);
    if (!channelUsername) {
      this.logger.warn('Некорректный URL канала', { channelUrl });
      return { success: false, error: 'Некорректный URL канала.' };
    }

    try {
      // 2. Проверка существования пользователя
      const userResult = await this.users.findByTelegramId(telegramUserId);
      if (!userResult.success || !userResult.data) {
        this.logger.warn('Пользователь не найден', { telegramUserId });
        return { success: false, error: 'Пользователь не найден.' };
      }
      const user = userResult.data;

      // 3. Получение информации о канале через userbot
      const channelInfo = await this.userbot.getChannelInfo(channelUsername);
      if (!channelInfo) {
        this.logger.warn('Канал не найден или недоступен', { channelUsername });
        return { success: false, error: 'Канал не найден или недоступен.' };
      }

      // 4. Создание или получение канала в БД
      const channelData: CreateChannelData = {
        telegram_channel_id: channelInfo.id,
        channel_name: channelInfo.title,
        channel_username: channelInfo.username,
        description: channelInfo.about,
      };

      const channelResult = await this.channels.createOrGet(channelData);
      if (!channelResult.success || !channelResult.data) {
        this.logger.error('Не удалось создать или получить канал', {
          error: channelResult.error,
        });
        return channelResult;
      }
      const channel = channelResult.data;

      // 5. Создание подписки
      const subscriptionResult = await this.channels.addUserSubscription(
        user.user_id,
        channel.channel_id,
      );

      if (!subscriptionResult.success) {
        this.logger.error('Не удалось создать подписку', {
          error: subscriptionResult.error,
        });
        return { success: false, error: subscriptionResult.error };
      }

      this.logger.info(
        `Пользователь ${user.user_id} успешно подписан на канал ${channel.channel_id}`,
      );
      return { success: true, data: channel };
    } catch (error) {
      this.logger.error('Ошибка в процессе подписки на канал:', {
        error,
        telegramUserId,
        channelUrl,
      });
      return {
        success: false,
        error:
          error instanceof Error ? error.message : 'Внутренняя ошибка сервера',
      };
    }
  }

  /**
   * Отписывает пользователя от канала
   */
  async unsubscribeUserFromChannel(
    telegramUserId: number,
    channelId: number,
  ): Promise<DatabaseResult<void>> {
    this.logger.info(
      `Попытка отписки пользователя ${telegramUserId} от канала ${channelId}`,
    );

    try {
      const userResult = await this.users.findByTelegramId(telegramUserId);
      if (!userResult.success || !userResult.data) {
        return { success: false, error: 'Пользователь не найден.' };
      }
      const user = userResult.data;

      const result = await this.channels.removeUserSubscription(
        user.user_id,
        channelId,
      );
      if (result.success) {
        this.logger.info(
          `Пользователь ${user.user_id} успешно отписан от канала ${channelId}`,
        );
      }
      return result;
    } catch (error) {
      this.logger.error('Ошибка при отписке от канала:', { error });
      return { success: false, error: 'Внутренняя ошибка сервера' };
    }
  }

  /**
   * Получает список каналов, на которые подписан пользователь
   */
  async getUserSubscriptions(
    telegramUserId: number,
  ): Promise<DatabaseResult<Channel[]>> {
    this.logger.debug(
      `Получение списка подписок для пользователя ${telegramUserId}`,
    );
    try {
      const userResult = await this.users.findByTelegramId(telegramUserId);
      if (!userResult.success || !userResult.data) {
        return { success: false, error: 'Пользователь не найден.' };
      }
      const user = userResult.data;

      return await this.channels.getUserChannels(user.user_id);
    } catch (error) {
      this.logger.error('Ошибка при получении подписок пользователя:', {
        error,
      });
      return { success: false, error: 'Внутренняя ошибка сервера', data: [] };
    }
  }
}

// Создаем singleton instance
const userbot = new TelegramUserbot(); // Здесь может быть более сложная логика инициализации
export const channelService = new ChannelService(channelDAO, userDAO, userbot);
