import { AIAnalysisService, AIAnalysisConfig } from '../../src/ai/AIAnalysisService';

// Мокаем OpenAI
jest.mock('openai', () => {
  return {
    OpenAI: jest.fn().mockImplementation(() => ({
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    }))
  };
});

describe('AIAnalysisService', () => {
  let aiService: AIAnalysisService;
  let mockOpenAI: any;

  const config: AIAnalysisConfig = {
    openaiApiKey: 'test-api-key',
    model: 'gpt-3.5-turbo',
    maxTokens: 1000,
    temperature: 0.3
  };

  beforeEach(() => {
    // Создаем мок для OpenAI
    const { OpenAI } = require('openai');
    mockOpenAI = {
      chat: {
        completions: {
          create: jest.fn()
        }
      }
    };
    OpenAI.mockImplementation(() => mockOpenAI);

    aiService = new AIAnalysisService(config);
  });

  afterEach(() => {
    jest.clearAllMocks();
  });

  describe('analyzeContent', () => {
    it('должен успешно анализировать контент', async () => {
      // Мокаем ответ от OpenAI
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              importance: {
                score: 85,
                reasoning: 'Важная новость о политике',
                factors: ['Политическая тема', 'Высокая актуальность']
              },
              category: {
                category: 'политика',
                confidence: 0.9,
                keywords: ['президент', 'указ', 'санкции']
              },
              sentiment: 'negative',
              keywords: ['президент', 'указ', 'санкции', 'экономика'],
              isSpam: false,
              isAd: false,
              summary: 'Президент подписал указ о санкциях'
            })
          }
        }]
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await aiService.analyzeContent(
        'Президент подписал важный указ о новых санкциях',
        'РБК Новости'
      );

      expect(result).toBeDefined();
      expect(result.importance.score).toBe(85);
      expect(result.category.category).toBe('политика');
      expect(result.sentiment).toBe('negative');
      expect(result.keywords).toContain('президент');
      expect(result.isSpam).toBe(false);
      expect(result.isAd).toBe(false);
    });

    it('должен обрабатывать ошибки и возвращать fallback результат', async () => {
      // Мокаем ошибку от OpenAI
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const result = await aiService.analyzeContent(
        'Тестовое сообщение',
        'Тестовый канал'
      );

      expect(result).toBeDefined();
      expect(result.importance.reasoning).toContain('Базовый анализ');
      expect(result.category.category).toBe('другое');
      expect(result.sentiment).toBe('neutral');
    });

    it('должен валидировать и исправлять неверные данные от ИИ', async () => {
      // Мокаем некорректный ответ от OpenAI
      const mockResponse = {
        choices: [{
          message: {
            content: JSON.stringify({
              importance: {
                score: 150, // Слишком большое значение
                reasoning: 'Тест',
                factors: []
              },
              category: {
                category: 'несуществующая_категория', // Неверная категория
                confidence: 2.0, // Слишком большое значение
                keywords: []
              },
              sentiment: 'неверная_тональность', // Неверная тональность
              keywords: [],
              isSpam: false,
              isAd: false
            })
          }
        }]
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const result = await aiService.analyzeContent('Тест');

      // Проверяем корректировку значений
      expect(result.importance.score).toBeLessThanOrEqual(100);
      expect(result.category.category).toBe('другое'); // Должно исправиться на дефолтную
      expect(result.category.confidence).toBeLessThanOrEqual(1.0);
      expect(result.sentiment).toBe('neutral'); // Должно исправиться на дефолтную
    });
  });

  describe('analyzeImportance', () => {
    it('должен возвращать числовую оценку важности', async () => {
      const mockResponse = {
        choices: [{
          message: {
            content: '75'
          }
        }]
      };

      mockOpenAI.chat.completions.create.mockResolvedValue(mockResponse);

      const score = await aiService.analyzeImportance(
        'Важная новость', 
        'Новостной канал'
      );

      expect(score).toBe(75);
      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });

    it('должен возвращать fallback score при ошибке', async () => {
      mockOpenAI.chat.completions.create.mockRejectedValue(new Error('API Error'));

      const score = await aiService.analyzeImportance('Тест');

      expect(score).toBeGreaterThanOrEqual(0);
      expect(score).toBeLessThanOrEqual(100);
    });
  });

  describe('fallback методы', () => {
    it('calculateFallbackImportance должен корректно рассчитывать важность', () => {
      // Используем рефлексию для доступа к приватному методу
      const calculateFallbackImportance = (aiService as any).calculateFallbackImportance.bind(aiService);

      // Короткое сообщение
      let score = calculateFallbackImportance('Привет');
      expect(score).toBeLessThan(50);

      // Длинное сообщение с ключевыми словами
      score = calculateFallbackImportance('Срочно! Президент подписал важный указ о курсе доллара. ' + 'А'.repeat(300));
      expect(score).toBeGreaterThan(70);
    });

    it('extractSimpleKeywords должен извлекать ключевые слова', () => {
      const extractSimpleKeywords = (aiService as any).extractSimpleKeywords.bind(aiService);

      const keywords = extractSimpleKeywords('Президент подписал важный указ о курсе доллара');
      
      expect(keywords).toBeInstanceOf(Array);
      expect(keywords.length).toBeGreaterThan(0);
      expect(keywords.every(word => word.length > 3)).toBe(true);
    });
  });

  describe('конфигурация', () => {
    it('должен использовать дефолтные значения конфигурации', () => {
      const defaultService = new AIAnalysisService({ openaiApiKey: 'test' });
      const stats = defaultService.getUsageStats();

      expect(stats.model).toBe('gpt-3.5-turbo');
      expect(stats.maxTokens).toBe(1000);
      expect(stats.availableCategories).toBeGreaterThan(10);
    });
  });
});