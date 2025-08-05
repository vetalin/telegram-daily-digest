import { Logger } from '../utils/logger';
import { messageDAO } from '../database/dao';
import { contentFilterService, FilterResult } from './ContentFilterService';
import { Message } from '../database/models';

/**
 * Статистика обработки фильтрации
 */
export interface ProcessingStats {
  processed: number;
  filtered: number;
  allowed: number;
  errors: number;
  processingTime: number;
}

/**
 * Сервис для пакетной обработки сообщений через фильтр контента
 */
export class FilterProcessorService {
  private logger: Logger;
  private isProcessing: boolean = false;

  constructor() {
    this.logger = new Logger('FilterProcessorService');
  }

  /**
   * Обрабатывает все нефильтрованные сообщения
   */
  async processAllUnfilteredMessages(
    batchSize: number = 100,
    delayBetweenBatches: number = 1000,
  ): Promise<ProcessingStats> {
    if (this.isProcessing) {
      throw new Error('Обработка уже выполняется');
    }

    this.isProcessing = true;
    const startTime = Date.now();
    let totalProcessed = 0;
    let totalFiltered = 0;
    let totalAllowed = 0;
    let totalErrors = 0;

    try {
      this.logger.info(
        'Начинаем пакетную обработку нефильтрованных сообщений',
        {
          batchSize,
          delayBetweenBatches,
        },
      );

      let hasMore = true;
      let batchNumber = 1;

      while (hasMore) {
        // Получаем следующую порцию нефильтрованных сообщений
        const unfilteredResult =
          await messageDAO.getUnfilteredMessages(batchSize);

        if (!unfilteredResult.success || !unfilteredResult.data) {
          this.logger.error(
            'Ошибка получения нефильтрованных сообщений:',
            unfilteredResult.error,
          );
          break;
        }

        const messages = unfilteredResult.data;
        hasMore = messages.length === batchSize;

        if (messages.length === 0) {
          this.logger.info('Нет сообщений для обработки');
          break;
        }

        this.logger.info(`Обрабатываем пакет ${batchNumber}`, {
          messagesCount: messages.length,
          hasMore,
        });

        // Обрабатываем каждое сообщение в пакете
        const batchStats = await this.processBatch(messages);

        totalProcessed += batchStats.processed;
        totalFiltered += batchStats.filtered;
        totalAllowed += batchStats.allowed;
        totalErrors += batchStats.errors;

        this.logger.info(`Пакет ${batchNumber} обработан`, {
          batchStats,
          totalProcessed,
          totalFiltered,
          totalAllowed,
          totalErrors,
        });

        // Делаем паузу между пакетами, чтобы не нагружать систему
        if (hasMore && delayBetweenBatches > 0) {
          await this.delay(delayBetweenBatches);
        }

        batchNumber++;
      }

      const processingTime = Date.now() - startTime;
      const stats: ProcessingStats = {
        processed: totalProcessed,
        filtered: totalFiltered,
        allowed: totalAllowed,
        errors: totalErrors,
        processingTime,
      };

      this.logger.info('Пакетная обработка завершена', {
        stats,
        processingTimeSeconds: processingTime / 1000,
      });

      return stats;
    } catch (error) {
      this.logger.error('Ошибка при пакетной обработке:', error);
      throw error;
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Обрабатывает один пакет сообщений
   */
  private async processBatch(messages: Message[]): Promise<ProcessingStats> {
    let processed = 0;
    let filtered = 0;
    let allowed = 0;
    let errors = 0;

    for (const message of messages) {
      try {
        // Применяем фильтрацию
        const filterResult = await contentFilterService.filterContent(
          message.content,
          message.media_type,
        );

        // Обновляем статус в базе данных
        const updateResult = await messageDAO.updateFilterStatus(
          message.message_id,
          !filterResult.isFiltered, // is_filtered = true означает "прошло фильтрацию"
          filterResult.reasons,
        );

        if (updateResult.success) {
          processed++;
          if (filterResult.isFiltered) {
            filtered++;
            this.logger.debug('Сообщение заблокировано', {
              messageId: message.message_id,
              reasons: filterResult.reasons,
              confidence: filterResult.confidence,
            });
          } else {
            allowed++;
          }
        } else {
          errors++;
          this.logger.error('Ошибка обновления статуса фильтрации:', {
            messageId: message.message_id,
            error: updateResult.error,
          });
        }
      } catch (error) {
        errors++;
        this.logger.error('Ошибка обработки сообщения:', {
          messageId: message.message_id,
          error,
        });
      }
    }

    return {
      processed,
      filtered,
      allowed,
      errors,
      processingTime: 0, // Для отдельного пакета время не измеряем
    };
  }

  /**
   * Получает статистику фильтрации из базы данных
   */
  async getFilterStatistics(): Promise<{
    total: number;
    filtered: number;
    unfiltered: number;
    filterRate: number;
  } | null> {
    try {
      const statsResult = await messageDAO.getFilterStats();

      if (statsResult.success && statsResult.data) {
        return statsResult.data;
      }

      this.logger.error('Ошибка получения статистики:', statsResult.error);
      return null;
    } catch (error) {
      this.logger.error('Ошибка получения статистики фильтрации:', error);
      return null;
    }
  }

  /**
   * Проверяет, выполняется ли обработка
   */
  isCurrentlyProcessing(): boolean {
    return this.isProcessing;
  }

  /**
   * Задержка между операциями
   */
  private delay(ms: number): Promise<void> {
    return new Promise((resolve) => setTimeout(resolve, ms));
  }

  /**
   * Обрабатывает конкретное сообщение по ID
   */
  async processSingleMessage(messageId: number): Promise<{
    success: boolean;
    filterResult?: FilterResult;
    error?: string;
  }> {
    try {
      // Получаем сообщение
      const messageResult = await messageDAO.getById(messageId);

      if (!messageResult.success || !messageResult.data) {
        return {
          success: false,
          error: messageResult.error || 'Сообщение не найдено',
        };
      }

      const message = messageResult.data;

      // Применяем фильтрацию
      const filterResult = await contentFilterService.filterContent(
        message.content,
        message.media_type,
      );

      // Обновляем статус в базе данных
      const updateResult = await messageDAO.updateFilterStatus(
        message.message_id,
        !filterResult.isFiltered,
        filterResult.reasons,
      );

      if (!updateResult.success) {
        return {
          success: false,
          error: updateResult.error,
        };
      }

      this.logger.info('Сообщение обработано', {
        messageId,
        isFiltered: !filterResult.isFiltered,
        blocked: filterResult.isFiltered,
        reasons: filterResult.reasons,
      });

      return {
        success: true,
        filterResult,
      };
    } catch (error) {
      this.logger.error('Ошибка обработки сообщения:', error);
      return {
        success: false,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка',
      };
    }
  }
}

// Экспортируем единственный экземпляр сервиса
export const filterProcessorService = new FilterProcessorService();
