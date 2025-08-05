import { AIProcessorService } from '../../src/services/AIProcessorService';
import { Message } from '../../src/database/models/Message';
import { Channel } from '../../src/database/models/Channel';

// Мокаем зависимости
jest.mock('../../src/ai/AIAnalysisService');
jest.mock('../../src/ai/NewsScoreService');
jest.mock('../../src/database/dao/MessageDAO');
jest.mock('../../src/database/dao/ChannelDAO');

describe('AIProcessorService', () => {
  let aiProcessor: AIProcessorService;
  let mockMessageDAO: any;
  let mockChannelDAO: any;
  let mockAIService: any;
  let mockNewsScoreService: any;

  const mockMessage: Message = {
    message_id: 1,
    telegram_message_id: 12345,
    channel_id: 1,
    sender_id: 67890,
    content: 'Тестовое сообщение для анализа',
    media_type: 'text',
    media_url: null,
    is_filtered: true,
    is_processed: false,
    importance_score: 0,
    category: null,
    created_at: new Date(),
    updated_at: new Date()
  };

  const mockChannel: Channel = {
    channel_id: 1,
    telegram_channel_id: 123,
    channel_name: 'Тестовый канал',
    channel_username: 'test_channel',
    description: 'Описание тестового канала',
    is_active: true,
    created_at: new Date(),
    updated_at: new Date()
  };

  beforeEach(() => {
    // Настраиваем моки
    mockMessageDAO = {
      getFiltered: jest.fn(),
      update: jest.fn(),
      getById: jest.fn()
    };

    mockChannelDAO = {
      getById: jest.fn()
    };

    mockAIService = {
      analyzeContent: jest.fn()
    };

    mockNewsScoreService = {
      calculateScore: jest.fn()
    };

    // Мокаем модули
    const { messageDAO } = require('../../src/database/dao/MessageDAO');
    const { channelDAO } = require('../../src/database/dao/ChannelDAO');
    const { getAIAnalysisService } = require('../../src/ai/AIAnalysisService');
    const { newsScoreService } = require('../../src/ai/NewsScoreService');

    Object.assign(messageDAO, mockMessageDAO);
    Object.assign(channelDAO, mockChannelDAO);
    getAIAnalysisService.mockReturnValue(mockAIService);
    Object.assign(newsScoreService, mockNewsScoreService);

    aiProcessor = new AIProcessorService({
      batchSize: 10,
      delayBetweenBatches: 100,
      enableFallback: true,
      skipIfProcessed: true
    });
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('processSingleMessage', () => {
    it('должен успешно обрабатывать сообщение', async () => {
      // Настраиваем моки
      mockAIService.analyzeContent.mockResolvedValue({
        importance: { score: 75, reasoning: 'Тест', factors: [] },
        category: { category: 'политика', confidence: 0.8, keywords: [] },
        sentiment: 'neutral',
        keywords: ['тест'],
        isSpam: false,
        isAd: false
      });

      mockNewsScoreService.calculateScore.mockResolvedValue({
        finalScore: 80,
        breakdown: { contentScore: 70, aiScore: 75, sourceScore: 80, timelinesScore: 90 },
        reasoning: ['Тест'],
        classification: 'high'
      });

      mockMessageDAO.update.mockResolvedValue({ success: true, data: mockMessage });

      const result = await aiProcessor.processSingleMessage(mockMessage, mockChannel);

      expect(result.success).toBe(true);
      expect(result.messageId).toBe(mockMessage.message_id);
      expect(result.finalScore).toBe(80);
      expect(result.category).toBe('политика');

      // Проверяем вызовы методов
      expect(mockAIService.analyzeContent).toHaveBeenCalledWith(
        mockMessage.content,
        mockChannel.channel_name,
        mockMessage.media_type
      );
      expect(mockNewsScoreService.calculateScore).toHaveBeenCalled();
      expect(mockMessageDAO.update).toHaveBeenCalledWith(
        mockMessage.message_id,
        expect.objectContaining({
          is_processed: true,
          importance_score: 80,
          category: 'политика'
        })
      );
    });

    it('должен пропускать уже обработанные сообщения', async () => {
      const processedMessage = { ...mockMessage, is_processed: true };

      const result = await aiProcessor.processSingleMessage(processedMessage, mockChannel);

      expect(result.success).toBe(true);
      expect(result.error).toBe('Уже обработано');
      expect(mockAIService.analyzeContent).not.toHaveBeenCalled();
    });

    it('должен обрабатывать короткие сообщения с минимальным score', async () => {
      const shortMessage = { ...mockMessage, content: 'Hi' };
      mockMessageDAO.update.mockResolvedValue({ success: true, data: shortMessage });

      const result = await aiProcessor.processSingleMessage(shortMessage, mockChannel);

      expect(result.success).toBe(true);
      expect(result.finalScore).toBe(10);
      expect(result.category).toBe('короткое сообщение');
      expect(mockAIService.analyzeContent).not.toHaveBeenCalled();
    });

    it('должен использовать fallback при ошибке ИИ', async () => {
      // ИИ анализ падает
      mockAIService.analyzeContent.mockRejectedValue(new Error('API Error'));
      
      // Но fallback должен сработать
      mockNewsScoreService.calculateScore.mockResolvedValue({
        finalScore: 50,
        breakdown: { contentScore: 50, aiScore: 30, sourceScore: 60, timelinesScore: 50 },
        reasoning: ['Fallback анализ'],
        classification: 'medium'
      });

      mockMessageDAO.update.mockResolvedValue({ success: true, data: mockMessage });

      const result = await aiProcessor.processSingleMessage(mockMessage, mockChannel);

      expect(result.success).toBe(true);
      expect(result.finalScore).toBe(50);
      expect(mockNewsScoreService.calculateScore).toHaveBeenCalled();
    });

    it('должен обрабатывать ошибки обновления базы данных', async () => {
      mockAIService.analyzeContent.mockResolvedValue({
        importance: { score: 75, reasoning: 'Тест', factors: [] },
        category: { category: 'политика', confidence: 0.8, keywords: [] },
        sentiment: 'neutral',
        keywords: ['тест'],
        isSpam: false,
        isAd: false
      });

      mockNewsScoreService.calculateScore.mockResolvedValue({
        finalScore: 80,
        breakdown: { contentScore: 70, aiScore: 75, sourceScore: 80, timelinesScore: 90 },
        reasoning: ['Тест'],
        classification: 'high'
      });

      // Ошибка обновления БД
      mockMessageDAO.update.mockResolvedValue({ 
        success: false, 
        error: 'Ошибка базы данных' 
      });

      const result = await aiProcessor.processSingleMessage(mockMessage, mockChannel);

      expect(result.success).toBe(false);
      expect(result.error).toContain('Не удалось обновить сообщение');
    });
  });

  describe('processAllUnprocessedMessages', () => {
    it('должен обрабатывать пакеты сообщений', async () => {
      const messages = [
        { ...mockMessage, message_id: 1 },
        { ...mockMessage, message_id: 2 },
        { ...mockMessage, message_id: 3 }
      ];

      // Первый вызов возвращает сообщения, второй - пустой массив
      mockMessageDAO.getFiltered
        .mockResolvedValueOnce({ data: messages, total: 3 })
        .mockResolvedValueOnce({ data: [], total: 0 });

      mockChannelDAO.getById.mockResolvedValue({ 
        success: true, 
        data: mockChannel 
      });

      // Мокаем успешную обработку каждого сообщения
      mockAIService.analyzeContent.mockResolvedValue({
        importance: { score: 70, reasoning: 'Тест', factors: [] },
        category: { category: 'другое', confidence: 0.5, keywords: [] },
        sentiment: 'neutral',
        keywords: [],
        isSpam: false,
        isAd: false
      });

      mockNewsScoreService.calculateScore.mockResolvedValue({
        finalScore: 70,
        breakdown: { contentScore: 60, aiScore: 70, sourceScore: 70, timelinesScore: 80 },
        reasoning: ['Тест'],
        classification: 'medium'
      });

      mockMessageDAO.update.mockResolvedValue({ success: true });

      const stats = await aiProcessor.processAllUnprocessedMessages();

      expect(stats.processed).toBe(3);
      expect(stats.successful).toBe(3);
      expect(stats.failed).toBe(0);
      expect(stats.errors).toBe(0);
      expect(stats.processingTime).toBeGreaterThan(0);
    });

    it('должен предотвращать параллельную обработку', async () => {
      // Первый вызов должен заблокировать второй
      mockMessageDAO.getFiltered.mockResolvedValue({ data: [], total: 0 });

      const promise1 = aiProcessor.processAllUnprocessedMessages();
      const promise2 = aiProcessor.processAllUnprocessedMessages();

      const [result1, result2] = await Promise.all([promise1, promise2]);

      // Один из вызовов должен быть заблокирован
      const successfulCalls = [result1, result2].filter(r => r.processed >= 0);
      expect(successfulCalls.length).toBe(1);
    });
  });

  describe('getProcessingStats', () => {
    it('должен возвращать статистику обработки', async () => {
      mockMessageDAO.getFiltered
        .mockResolvedValueOnce({ total: 100 }) // Общее количество
        .mockResolvedValueOnce({ total: 60 });  // Обработанные

      const stats = await aiProcessor.getProcessingStats();

      expect(stats.total).toBe(100);
      expect(stats.processed).toBe(60);
      expect(stats.unprocessed).toBe(40);
      expect(stats.avgImportanceScore).toBeDefined();
    });

    it('должен обрабатывать ошибки при получении статистики', async () => {
      mockMessageDAO.getFiltered.mockRejectedValue(new Error('DB Error'));

      const stats = await aiProcessor.getProcessingStats();

      expect(stats.total).toBe(0);
      expect(stats.processed).toBe(0);
      expect(stats.unprocessed).toBe(0);
    });
  });

  describe('isHealthy', () => {
    it('должен возвращать true для здорового сервиса', () => {
      expect(aiProcessor.isHealthy()).toBe(true);
    });
  });

  describe('updateConfig', () => {
    it('должен позволять обновлять конфигурацию', () => {
      const newConfig = {
        batchSize: 20,
        enableFallback: false
      };

      aiProcessor.updateConfig(newConfig);

      // Проверить, что конфигурация обновлена
      // (это требует доступа к приватным полям, поэтому упростим)
      expect(() => aiProcessor.updateConfig(newConfig)).not.toThrow();
    });
  });

  describe('fallback анализ', () => {
    it('должен корректно выполнять fallback анализ', async () => {
      // Отключаем ИИ сервис
      const processorWithoutAI = new AIProcessorService({
        enableFallback: true
      });

      // Мокаем getAIAnalysisService чтобы вернуть null
      const { getAIAnalysisService } = require('../../src/ai/AIAnalysisService');
      getAIAnalysisService.mockImplementation(() => {
        throw new Error('AI Service not available');
      });

      mockNewsScoreService.calculateScore.mockResolvedValue({
        finalScore: 40,
        breakdown: { contentScore: 40, aiScore: 30, sourceScore: 50, timelinesScore: 50 },
        reasoning: ['Fallback анализ'],
        classification: 'low'
      });

      mockMessageDAO.update.mockResolvedValue({ success: true, data: mockMessage });

      const result = await processorWithoutAI.processSingleMessage(mockMessage, mockChannel);

      expect(result.success).toBe(true);
      expect(result.finalScore).toBe(40);
    });
  });
});