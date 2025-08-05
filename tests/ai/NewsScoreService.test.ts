import { NewsScoreService } from '../../src/ai/NewsScoreService';
import { AIAnalysisResult } from '../../src/ai/AIAnalysisService';

describe('NewsScoreService', () => {
  let scoreService: NewsScoreService;

  beforeEach(() => {
    scoreService = new NewsScoreService();
  });

  // Мок для ИИ анализа
  const createMockAIAnalysis = (overrides?: Partial<AIAnalysisResult>): AIAnalysisResult => ({
    importance: {
      score: 70,
      reasoning: 'Тестовый анализ',
      factors: ['тест1', 'тест2']
    },
    category: {
      category: 'политика',
      confidence: 0.8,
      keywords: ['тест', 'новость']
    },
    sentiment: 'neutral',
    keywords: ['тест', 'новость', 'политика'],
    isSpam: false,
    isAd: false,
    ...overrides
  });

  describe('calculateScore', () => {
    it('должен рассчитывать score для обычной новости', async () => {
      const aiAnalysis = createMockAIAnalysis();
      
      const result = await scoreService.calculateScore(
        'Президент подписал важный указ о новых мерах поддержки экономики',
        aiAnalysis,
        'РБК',
        10000,
        true
      );

      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(100);
      expect(result.classification).toMatch(/^(critical|high|medium|low|minimal)$/);
      expect(result.breakdown).toBeDefined();
      expect(result.reasoning).toBeInstanceOf(Array);
      expect(result.reasoning.length).toBeGreaterThan(0);
    });

    it('должен давать высокий score для breaking news', async () => {
      const aiAnalysis = createMockAIAnalysis({ 
        importance: { score: 95, reasoning: 'Экстренная новость', factors: [] }
      });
      
      const result = await scoreService.calculateScore(
        '⚡ СРОЧНО: Происходит важное событие прямо сейчас!',
        aiAnalysis,
        'Экстренные новости',
        50000,
        true
      );

      expect(result.finalScore).toBeGreaterThan(80);
      expect(result.classification).toMatch(/^(critical|high)$/);
      expect(result.reasoning.some(r => r.includes('Экстренная новость'))).toBe(true);
    });

    it('должен давать низкий score для рекламы и спама', async () => {
      const aiAnalysis = createMockAIAnalysis({ 
        importance: { score: 20, reasoning: 'Рекламный контент', factors: [] },
        isAd: true,
        isSpam: true
      });
      
      const result = await scoreService.calculateScore(
        'Покупайте наши товары! Скидки до 90%! Переходите по ссылке!',
        aiAnalysis,
        'Реклама',
        1000,
        false
      );

      expect(result.finalScore).toBeLessThan(50);
      expect(result.classification).toMatch(/^(low|minimal)$/);
    });

    it('должен учитывать надежность источника', async () => {
      const aiAnalysis = createMockAIAnalysis();
      
      // Надежный источник
      const reliableResult = await scoreService.calculateScore(
        'Тестовая новость',
        aiAnalysis,
        'РБК Новости',
        50000,
        true
      );

      // Ненадежный источник
      const unreliableResult = await scoreService.calculateScore(
        'Тестовая новость',
        aiAnalysis,
        'Аноним слухи',
        100,
        false
      );

      expect(reliableResult.breakdown.sourceScore).toBeGreaterThan(unreliableResult.breakdown.sourceScore);
    });

    it('должен корректно классифицировать важность по score', async () => {
      const aiAnalysis = createMockAIAnalysis();

      // Тест для каждого уровня классификации
      const testCases = [
        { score: 95, expectedClass: 'critical' },
        { score: 75, expectedClass: 'high' },
        { score: 55, expectedClass: 'medium' },
        { score: 35, expectedClass: 'low' },
        { score: 15, expectedClass: 'minimal' }
      ];

      for (const testCase of testCases) {
        aiAnalysis.importance.score = testCase.score;
        
        const result = await scoreService.calculateScore(
          'Тестовое сообщение',
          aiAnalysis
        );

        expect(result.classification).toBe(testCase.expectedClass);
      }
    });
  });

  describe('весовые коэффициенты', () => {
    it('должен использовать корректные дефолтные веса', () => {
      const weights = scoreService.getWeights();
      
      expect(weights.aiWeight).toBe(0.5);
      expect(weights.contentWeight).toBe(0.25);
      expect(weights.sourceWeight).toBe(0.15);
      expect(weights.timelinessWeight).toBe(0.1);
      
      // Сумма весов должна быть 1.0
      const total = Object.values(weights).reduce((sum, weight) => sum + weight, 0);
      expect(total).toBeCloseTo(1.0, 2);
    });

    it('должен позволять обновлять веса', () => {
      const newWeights = {
        aiWeight: 0.6,
        contentWeight: 0.2,
        sourceWeight: 0.1,
        timelinessWeight: 0.1
      };

      scoreService.updateWeights(newWeights);
      const updatedWeights = scoreService.getWeights();

      expect(updatedWeights.aiWeight).toBe(0.6);
      expect(updatedWeights.contentWeight).toBe(0.2);
    });
  });

  describe('определение паттернов', () => {
    it('должен определять breaking news паттерны', async () => {
      const aiAnalysis = createMockAIAnalysis();
      
      const breakingNewsTexts = [
        '⚡ МОЛНИЯ: Важное событие',
        'СРОЧНО! Происходит что-то важное',
        'Только что случилось',
        'Происходит сейчас в прямом эфире'
      ];

      for (const text of breakingNewsTexts) {
        const result = await scoreService.calculateScore(text, aiAnalysis);
        expect(result.breakdown.timelinesScore).toBeGreaterThan(80);
      }
    });

    it('должен определять важные ключевые слова', async () => {
      const aiAnalysis = createMockAIAnalysis();
      
      const importantTexts = [
        'Президент подписал указ',
        'ЦБ изменил курс доллара',
        'Произошла авария с большими жертвами',
        'Новые санкции против страны'
      ];

      for (const text of importantTexts) {
        const result = await scoreService.calculateScore(text, aiAnalysis);
        expect(result.breakdown.contentScore).toBeGreaterThan(40);
      }
    });
  });

  describe('надежность источников', () => {
    it('должен правильно оценивать надежность известных источников', async () => {
      const aiAnalysis = createMockAIAnalysis();
      
      const reliableSources = ['РБК', 'ТАСС', 'Интерфакс', 'Коммерсант'];
      const unreliableSources = ['Аноним', 'Слухи', 'Неофициальный'];

      for (const source of reliableSources) {
        const result = await scoreService.calculateScore('Тест', aiAnalysis, source, 1000, true);
        expect(result.breakdown.sourceScore).toBeGreaterThan(70);
      }

      for (const source of unreliableSources) {
        const result = await scoreService.calculateScore('Тест', aiAnalysis, source, 100, false);
        expect(result.breakdown.sourceScore).toBeLessThan(50);
      }
    });
  });

  describe('getStats', () => {
    it('должен возвращать статистику сервиса', () => {
      const stats = scoreService.getStats();

      expect(stats).toBeDefined();
      expect(stats.weights).toBeDefined();
      expect(stats.criticalKeywordsCount).toBeGreaterThan(0);
      expect(stats.highImportanceKeywordsCount).toBeGreaterThan(0);
      expect(stats.breakingNewsPatternsCount).toBeGreaterThan(0);
    });
  });

  describe('edge cases', () => {
    it('должен обрабатывать пустой контент', async () => {
      const aiAnalysis = createMockAIAnalysis();
      
      const result = await scoreService.calculateScore('', aiAnalysis);
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(100);
    });

    it('должен обрабатывать отсутствие метаданных канала', async () => {
      const aiAnalysis = createMockAIAnalysis();
      
      const result = await scoreService.calculateScore(
        'Тестовая новость',
        aiAnalysis
        // Без channelName, subscribers, etc.
      );
      
      expect(result.finalScore).toBeGreaterThanOrEqual(0);
      expect(result.finalScore).toBeLessThanOrEqual(100);
    });
  });
});