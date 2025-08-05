/**
 * MessageProcessingPipeline - координирует полный pipeline обработки сообщений
 * Включает фильтрацию, ИИ анализ и систему уведомлений
 */

import { MessageDAO } from '../database/dao/MessageDAO';
import { ContentFilterService } from './ContentFilterService';
import { AIProcessorService } from './AIProcessorService';
import { NotificationService } from './NotificationService';
import { NotificationSender } from './NotificationSender';
import { TelegramBotService } from '../bot/TelegramBot';
import { AIAnalysisService } from '../ai/AIAnalysisService';
import { Message, Channel, DatabaseResult } from '../database/models';
import { createLogger } from '../utils/logger';
import { Logger } from 'winston';

export interface PipelineConfig {
  enableFiltering: boolean;
  enableAIAnalysis: boolean;
  enableNotifications: boolean;
  enableAutoSending: boolean;
  batchSize: number;
  processingDelay: number;
}

export interface PipelineResult {
  success: boolean;
  messageId: number;
  filtered: boolean;
  analyzed: boolean;
  notificationsCreated: number;
  notificationsSent: number;
  finalScore?: number;
  category?: string;
  error?: string;
}

export interface PipelineStats {
  processed: number;
  filtered: number;
  analyzed: number;
  notificationsCreated: number;
  notificationsSent: number;
  errors: number;
  processingTime: number;
}

export class MessageProcessingPipeline {
  private logger: Logger;
  private messageDAO: MessageDAO;
  private contentFilter: ContentFilterService;
  private aiProcessor: AIProcessorService;
  private notificationService: NotificationService;
  private notificationSender?: NotificationSender;
  private config: PipelineConfig;
  private isProcessing: boolean = false;

  constructor(
    aiService?: AIAnalysisService,
    telegramBot?: TelegramBotService,
    config?: Partial<PipelineConfig>,
  ) {
    this.logger = createLogger('MessageProcessingPipeline');
    this.messageDAO = new MessageDAO();
    this.contentFilter = new ContentFilterService();
    this.aiProcessor = new AIProcessorService();
    this.notificationService = new NotificationService(aiService);

    // Инициализируем NotificationSender если есть Telegram Bot
    if (telegramBot) {
      this.notificationSender = new NotificationSender(telegramBot);
    }

    this.config = {
      enableFiltering: true,
      enableAIAnalysis: true,
      enableNotifications: true,
      enableAutoSending: true,
      batchSize: 10,
      processingDelay: 1000,
      ...config,
    };
  }

  /**
   * Инициализирует pipeline
   */
  async initialize(): Promise<void> {
    try {
      this.logger.info('Initializing MessageProcessingPipeline...');

      // Инициализируем NotificationSender если он есть
      if (this.notificationSender) {
        await this.notificationSender.initialize();
      }

      this.logger.info('MessageProcessingPipeline initialized successfully', {
        config: this.config,
      });
    } catch (error) {
      this.logger.error('Failed to initialize MessageProcessingPipeline', {
        error,
      });
      throw error;
    }
  }

  /**
   * Обрабатывает одно сообщение через весь pipeline
   */
  async processSingleMessage(
    message: Message,
    channel?: Channel,
  ): Promise<PipelineResult> {
    const startTime = Date.now();

    const result: PipelineResult = {
      success: false,
      messageId: message.message_id,
      filtered: false,
      analyzed: false,
      notificationsCreated: 0,
      notificationsSent: 0,
    };

    try {
      this.logger.debug('Processing message through pipeline', {
        messageId: message.message_id,
        channelId: message.channel_id,
      });

      // Этап 1: Фильтрация контента
      if (this.config.enableFiltering) {
        const filterResult = await this.contentFilter.filterContent(
          message.content,
          message.media_type,
        );

        // Обновляем статус фильтрации в БД
        const updateResult = await this.messageDAO.updateFilterStatus(
          message.message_id,
          !filterResult.isFiltered,
          filterResult.reasons,
        );

        if (!updateResult.success) {
          result.error = `Failed to update filter status: ${updateResult.error}`;
          return result;
        }

        result.filtered = !filterResult.isFiltered;

        // Если сообщение заблокировано, завершаем обработку
        if (filterResult.isFiltered) {
          this.logger.debug('Message blocked by content filter', {
            messageId: message.message_id,
            reasons: filterResult.reasons,
          });
          result.success = true;
          return result;
        }
      }

      // Этап 2: ИИ анализ
      if (this.config.enableAIAnalysis) {
        const aiResult = await this.aiProcessor.processSingleMessage(
          message,
          channel,
        );

        if (aiResult.success) {
          result.analyzed = true;
          result.finalScore = aiResult.finalScore;
          result.category = aiResult.category;

          this.logger.debug('AI analysis completed', {
            messageId: message.message_id,
            finalScore: aiResult.finalScore,
            category: aiResult.category,
          });
        } else {
          this.logger.warn('AI analysis failed', {
            messageId: message.message_id,
            error: aiResult.error,
          });
        }
      }

      // Этап 3: Создание уведомлений
      if (this.config.enableNotifications) {
        // Получаем обновленное сообщение с результатами ИИ анализа
        const updatedMessageResult = await this.messageDAO.getById(
          message.message_id,
        );

        if (updatedMessageResult.success && updatedMessageResult.data) {
          const notificationResult =
            await this.notificationService.processMessageForNotifications(
              updatedMessageResult.data,
            );

          if (notificationResult.success && notificationResult.data) {
            result.notificationsCreated = notificationResult.data.length;

            this.logger.debug('Notifications created', {
              messageId: message.message_id,
              count: notificationResult.data.length,
            });

            // Этап 4: Автоматическая отправка уведомлений
            if (
              this.config.enableAutoSending &&
              this.notificationSender &&
              notificationResult.data.length > 0
            ) {
              try {
                const sendingResult =
                  await this.notificationSender.sendBulkNotifications(
                    notificationResult.data,
                  );

                result.notificationsSent = sendingResult.successful;

                this.logger.debug('Notifications sent', {
                  messageId: message.message_id,
                  sent: sendingResult.successful,
                  failed: sendingResult.failed,
                });
              } catch (sendingError) {
                this.logger.error('Failed to send notifications', {
                  messageId: message.message_id,
                  error: sendingError,
                });
              }
            }
          }
        }
      }

      result.success = true;

      const processingTime = Date.now() - startTime;
      this.logger.info('Message processing completed', {
        messageId: message.message_id,
        processingTime,
        result: {
          filtered: result.filtered,
          analyzed: result.analyzed,
          notificationsCreated: result.notificationsCreated,
          notificationsSent: result.notificationsSent,
        },
      });

      return result;
    } catch (error) {
      this.logger.error('Error in message processing pipeline', {
        messageId: message.message_id,
        error,
      });

      result.error = error instanceof Error ? error.message : 'Unknown error';
      return result;
    }
  }

  /**
   * Обрабатывает пакет сообщений
   */
  async processBatch(
    messages: Message[],
    channels?: Map<number, Channel>,
  ): Promise<PipelineStats> {
    const startTime = Date.now();

    const stats: PipelineStats = {
      processed: 0,
      filtered: 0,
      analyzed: 0,
      notificationsCreated: 0,
      notificationsSent: 0,
      errors: 0,
      processingTime: 0,
    };

    if (this.isProcessing) {
      this.logger.warn('Pipeline is already processing, skipping batch');
      return stats;
    }

    this.isProcessing = true;

    try {
      this.logger.info('Processing message batch', {
        count: messages.length,
        batchSize: this.config.batchSize,
      });

      for (const message of messages) {
        try {
          const channel = channels?.get(message.channel_id || 0);
          const result = await this.processSingleMessage(message, channel);

          stats.processed++;

          if (result.success) {
            if (!result.filtered) stats.filtered++;
            if (result.analyzed) stats.analyzed++;
            stats.notificationsCreated += result.notificationsCreated;
            stats.notificationsSent += result.notificationsSent;
          } else {
            stats.errors++;
          }

          // Задержка между сообщениями
          if (this.config.processingDelay > 0) {
            await this.delay(this.config.processingDelay);
          }
        } catch (error) {
          stats.errors++;
          this.logger.error('Error processing message in batch', {
            messageId: message.message_id,
            error,
          });
        }
      }

      stats.processingTime = Date.now() - startTime;

      this.logger.info('Batch processing completed', stats);
      return stats;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Обрабатывает все необработанные сообщения
   */
  async processAllPending(): Promise<PipelineStats> {
    try {
      this.logger.info('Starting processing of all pending messages');

      // Получаем все сообщения, которые прошли фильтрацию, но не были обработаны ИИ
      const messagesResult = await this.messageDAO.getAll({
        is_filtered: true,
        is_processed: false,
      });

      if (!messagesResult.success || !messagesResult.data) {
        this.logger.info('No pending messages found');
        return {
          processed: 0,
          filtered: 0,
          analyzed: 0,
          notificationsCreated: 0,
          notificationsSent: 0,
          errors: 0,
          processingTime: 0,
        };
      }

      const messages = messagesResult.data.items;
      return await this.processBatch(messages);
    } catch (error) {
      this.logger.error('Error processing all pending messages', { error });
      throw error;
    }
  }

  /**
   * Отправляет все неотправленные уведомления
   */
  async sendAllPendingNotifications(): Promise<{
    total: number;
    sent: number;
    failed: number;
  }> {
    try {
      if (!this.notificationSender) {
        this.logger.warn('NotificationSender not available');
        return { total: 0, sent: 0, failed: 0 };
      }

      this.logger.info('Sending all pending notifications');

      const result =
        await this.notificationSender.sendAllPendingNotifications();

      this.logger.info('Pending notifications processing completed', {
        total: result.total,
        sent: result.successful,
        failed: result.failed,
      });

      return {
        total: result.total,
        sent: result.successful,
        failed: result.failed,
      };
    } catch (error) {
      this.logger.error('Error sending pending notifications', { error });
      throw error;
    }
  }

  /**
   * Получает статистику pipeline
   */
  async getStats(): Promise<{
    pipeline: PipelineConfig;
    health: {
      contentFilter: boolean;
      aiProcessor: boolean;
      notificationService: boolean;
      notificationSender: boolean;
    };
  }> {
    const health = {
      contentFilter: true, // Предполагаем что всегда работает
      aiProcessor: true, // Можно добавить проверку
      notificationService: true,
      notificationSender: this.notificationSender
        ? (await this.notificationSender.checkChannelHealth()).overall
        : false,
    };

    return {
      pipeline: this.config,
      health,
    };
  }

  /**
   * Обновляет конфигурацию pipeline
   */
  updateConfig(config: Partial<PipelineConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('Pipeline configuration updated', { config: this.config });
  }

  /**
   * Проверяет, обрабатывается ли pipeline
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  /**
   * Задержка выполнения
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Останавливает pipeline
   */
  async stop(): Promise<void> {
    try {
      this.logger.info('Stopping MessageProcessingPipeline...');

      if (this.notificationSender) {
        await this.notificationSender.stop();
      }

      this.logger.info('MessageProcessingPipeline stopped successfully');
    } catch (error) {
      this.logger.error('Error stopping pipeline', { error });
    }
  }
}
