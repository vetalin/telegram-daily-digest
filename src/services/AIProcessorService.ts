import { Logger } from '../utils/logger';
import { getAIAnalysisService, AIAnalysisResult } from '../ai/AIAnalysisService';
import { newsScoreService, NewsScore } from '../ai/NewsScoreService';
import { messageDAO } from '../database/dao/MessageDAO';
import { channelDAO } from '../database/dao/ChannelDAO';
import { Message, UpdateMessageData } from '../database/models/Message';
import { Channel } from '../database/models/Channel';

/**
 * Статистика обработки ИИ анализа
 */
export interface AIProcessingStats {
  processed: number;
  successful: number;
  failed: number;
  skipped: number;
  errors: number;
  processingTime: number;
}

/**
 * Результат обработки одного сообщения
 */
export interface MessageProcessingResult {
  success: boolean;
  messageId: number;
  aiAnalysis?: AIAnalysisResult;
  newsScore?: NewsScore;
  finalScore?: number;
  category?: string;
  error?: string;
}

/**
 * Конфигурация ИИ процессора
 */
export interface AIProcessorConfig {
  batchSize?: number;
  delayBetweenBatches?: number;
  enableFallback?: boolean;
  minContentLength?: number;
  skipIfProcessed?: boolean;
}

/**
 * Сервис для обработки сообщений с помощью ИИ анализа
 */
export class AIProcessorService {
  private logger: Logger;
  private aiService: ReturnType<typeof getAIAnalysisService> | null = null;
  private isProcessing: boolean = false;
  private config: Required<AIProcessorConfig>;

  constructor(config?: AIProcessorConfig) {
    this.logger = new Logger('AIProcessorService');
    
    this.config = {
      batchSize: 50,
      delayBetweenBatches: 2000, // 2 секунды между пакетами
      enableFallback: true,
      minContentLength: 10,
      skipIfProcessed: true,
      ...config
    };

    this.initializeAIService();
  }

  /**
   * Инициализация ИИ сервиса
   */
  private async initializeAIService(): Promise<void> {
    try {
      this.aiService = getAIAnalysisService();
      this.logger.info('AI сервис инициализирован');
    } catch (error) {
      this.logger.error('Не удалось инициализировать AI сервис', { error });
      
      if (!this.config.enableFallback) {
        throw error;
      }
    }
  }

  /**
   * Обработка всех необработанных сообщений
   */
  async processAllUnprocessedMessages(): Promise<AIProcessingStats> {
    if (this.isProcessing) {
      this.logger.warn('Обработка уже выполняется');
      return this.getEmptyStats();
    }

    this.isProcessing = true;
    const startTime = Date.now();

    try {
      this.logger.info('Начинаем обработку необработанных сообщений');

      const stats: AIProcessingStats = {
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        errors: 0,
        processingTime: 0
      };

      let offset = 0;
      let hasMore = true;

      while (hasMore) {
        // Получаем пакет необработанных сообщений
        const messagesResult = await messageDAO.getFiltered(
          {
            is_filtered: true, // только прошедшие фильтрацию
            is_processed: false // но ещё не обработанные ИИ
          },
          {
            limit: this.config.batchSize,
            offset: offset
          }
        );

        const messages = messagesResult.data;

        if (messages.length === 0) {
          hasMore = false;
          break;
        }

        this.logger.debug(`Обрабатываем пакет из ${messages.length} сообщений`, {
          offset,
          batchSize: this.config.batchSize
        });

        // Обрабатываем пакет
        const batchStats = await this.processBatch(messages);
        
        // Суммируем статистику
        stats.processed += batchStats.processed;
        stats.successful += batchStats.successful;
        stats.failed += batchStats.failed;
        stats.skipped += batchStats.skipped;
        stats.errors += batchStats.errors;

        offset += this.config.batchSize;

        // Пауза между пакетами для снижения нагрузки на API
        if (hasMore && this.config.delayBetweenBatches > 0) {
          await this.delay(this.config.delayBetweenBatches);
        }
      }

      stats.processingTime = Date.now() - startTime;

      this.logger.info('Обработка завершена', {
        processed: stats.processed,
        successful: stats.successful,
        failed: stats.failed,
        skipped: stats.skipped,
        errors: stats.errors,
        processingTimeMs: stats.processingTime
      });

      return stats;

    } catch (error) {
      this.logger.error('Критическая ошибка при обработке сообщений', { error });
      return {
        processed: 0,
        successful: 0,
        failed: 0,
        skipped: 0,
        errors: 1,
        processingTime: Date.now() - startTime
      };
    } finally {
      this.isProcessing = false;
    }
  }

  /**
   * Обработка одного пакета сообщений
   */
  private async processBatch(messages: Message[]): Promise<AIProcessingStats> {
    const stats: AIProcessingStats = {
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
      processingTime: 0
    };

    // Получаем информацию о каналах для улучшения анализа
    const channelIds = [...new Set(messages.map(m => m.channel_id))];
    const channelsMap = await this.getChannelsMap(channelIds);

    for (const message of messages) {
      try {
        const result = await this.processSingleMessage(message, channelsMap.get(message.channel_id));
        
        stats.processed++;
        
        if (result.success) {
          stats.successful++;
        } else {
          stats.failed++;
        }

      } catch (error) {
        stats.errors++;
        this.logger.error('Ошибка обработки сообщения', {
          messageId: message.message_id,
          error
        });
      }
    }

    return stats;
  }

  /**
   * Обработка одного сообщения
   */
  async processSingleMessage(
    message: Message, 
    channel?: Channel
  ): Promise<MessageProcessingResult> {
    try {
      // Проверяем, нужно ли обрабатывать
      if (this.config.skipIfProcessed && message.is_processed) {
        return {
          success: true,
          messageId: message.message_id,
          error: 'Уже обработано'
        };
      }

      // Проверяем минимальную длину контента
      if (message.content.length < this.config.minContentLength) {
        // Отмечаем как обработанное, но с минимальным score
        await this.updateMessageAsProcessed(message.message_id, {
          importance_score: 10,
          category: 'короткое сообщение'
        });

        return {
          success: true,
          messageId: message.message_id,
          finalScore: 10,
          category: 'короткое сообщение'
        };
      }

      // Выполняем ИИ анализ
      let aiAnalysis: AIAnalysisResult;
      let newsScore: NewsScore;

      if (this.aiService) {
        try {
          aiAnalysis = await this.aiService.analyzeContent(
            message.content,
            channel?.channel_name,
            message.media_type
          );

          newsScore = await newsScoreService.calculateScore(
            message.content,
            aiAnalysis,
            channel?.channel_name,
            undefined, // subscribers count не доступен
            false, // verified status не доступен
            message.media_type
          );

        } catch (aiError) {
          this.logger.warn('Ошибка ИИ анализа, используем fallback', {
            messageId: message.message_id,
            error: aiError
          });

          if (!this.config.enableFallback) {
            throw aiError;
          }

          // Fallback анализ
          aiAnalysis = await this.getFallbackAnalysis(message);
          newsScore = await this.getFallbackScore(message, aiAnalysis);
        }
      } else {
        // Только fallback если ИИ сервис недоступен
        aiAnalysis = await this.getFallbackAnalysis(message);
        newsScore = await this.getFallbackScore(message, aiAnalysis);
      }

      // Сохраняем результаты в базу данных
      const updateData: UpdateMessageData = {
        is_processed: true,
        importance_score: newsScore.finalScore,
        category: aiAnalysis.category.category
      };

      const updateResult = await messageDAO.update(message.message_id, updateData);

      if (!updateResult.success) {
        throw new Error(`Не удалось обновить сообщение: ${updateResult.error}`);
      }

      this.logger.debug('Сообщение успешно обработано', {
        messageId: message.message_id,
        finalScore: newsScore.finalScore,
        category: aiAnalysis.category.category,
        classification: newsScore.classification
      });

      return {
        success: true,
        messageId: message.message_id,
        aiAnalysis,
        newsScore,
        finalScore: newsScore.finalScore,
        category: aiAnalysis.category.category
      };

    } catch (error) {
      this.logger.error('Ошибка обработки сообщения', {
        messageId: message.message_id,
        error
      });

      return {
        success: false,
        messageId: message.message_id,
        error: error instanceof Error ? error.message : 'Неизвестная ошибка'
      };
    }
  }

  /**
   * Fallback анализ без ИИ
   */
  private async getFallbackAnalysis(message: Message): Promise<AIAnalysisResult> {
    // Простая эвристическая оценка
    const contentLength = message.content.length;
    let importance = 30; // базовая оценка

    // Увеличиваем за длину
    if (contentLength > 200) importance += 15;
    if (contentLength > 500) importance += 15;

    // Ключевые слова
    const criticalWords = ['срочно', 'важно', 'экстренно', 'внимание'];
    const hasCriticalWords = criticalWords.some(word => 
      message.content.toLowerCase().includes(word)
    );
    
    if (hasCriticalWords) importance += 25;

    return {
      importance: {
        score: Math.min(100, importance),
        reasoning: 'Fallback анализ',
        factors: ['Длина контента', 'Ключевые слова']
      },
      category: {
        category: 'другое',
        confidence: 0.3,
        keywords: []
      },
      sentiment: 'neutral',
      keywords: [],
      isSpam: false,
      isAd: false
    };
  }

  /**
   * Fallback scoring без ИИ
   */
  private async getFallbackScore(message: Message, aiAnalysis: AIAnalysisResult): Promise<NewsScore> {
    return newsScoreService.calculateScore(
      message.content,
      aiAnalysis,
      'неизвестный канал',
      undefined,
      false,
      message.media_type
    );
  }

  /**
   * Получение карты каналов
   */
  private async getChannelsMap(channelIds: number[]): Promise<Map<number, Channel>> {
    const channelsMap = new Map<number, Channel>();

    try {
      for (const channelId of channelIds) {
        const channelResult = await channelDAO.getById(channelId);
        if (channelResult.success && channelResult.data) {
          channelsMap.set(channelId, channelResult.data);
        }
      }
    } catch (error) {
      this.logger.warn('Ошибка загрузки информации о каналах', { error });
    }

    return channelsMap;
  }

  /**
   * Обновление сообщения как обработанного
   */
  private async updateMessageAsProcessed(
    messageId: number, 
    additionalData?: Partial<UpdateMessageData>
  ): Promise<void> {
    const updateData: UpdateMessageData = {
      is_processed: true,
      ...additionalData
    };

    await messageDAO.update(messageId, updateData);
  }

  /**
   * Задержка между запросами
   */
  private delay(ms: number): Promise<void> {
    return new Promise(resolve => setTimeout(resolve, ms));
  }

  /**
   * Получение пустой статистики
   */
  private getEmptyStats(): AIProcessingStats {
    return {
      processed: 0,
      successful: 0,
      failed: 0,
      skipped: 0,
      errors: 0,
      processingTime: 0
    };
  }

  /**
   * Получение статистики обработки
   */
  async getProcessingStats(): Promise<{
    total: number;
    processed: number;
    unprocessed: number;
    avgImportanceScore: number;
  }> {
    try {
      // Общее количество прошедших фильтрацию
      const totalResult = await messageDAO.getFiltered({ is_filtered: true });
      const total = totalResult.total;

      // Количество обработанных
      const processedResult = await messageDAO.getFiltered({ 
        is_filtered: true, 
        is_processed: true 
      });
      const processed = processedResult.total;

      // Средний score важности
      // Это требует дополнительного SQL запроса, упростим пока
      const avgImportanceScore = 0; // TODO: implement if needed

      return {
        total,
        processed,
        unprocessed: total - processed,
        avgImportanceScore
      };

    } catch (error) {
      this.logger.error('Ошибка получения статистики', { error });
      return { total: 0, processed: 0, unprocessed: 0, avgImportanceScore: 0 };
    }
  }

  /**
   * Проверка состояния сервиса
   */
  isHealthy(): boolean {
    return !this.isProcessing && (this.aiService !== null || this.config.enableFallback);
  }

  /**
   * Обновление конфигурации
   */
  updateConfig(newConfig: Partial<AIProcessorConfig>): void {
    this.config = { ...this.config, ...newConfig };
    this.logger.info('Конфигурация обновлена', { config: this.config });
  }
}

// Экспорт единственного экземпляра сервиса
export const aiProcessorService = new AIProcessorService();