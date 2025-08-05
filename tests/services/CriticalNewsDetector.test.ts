/**
 * Тесты для CriticalNewsDetector
 */

import {
  CriticalNewsDetector,
  CriticalNewsConfig,
} from '../../src/services/CriticalNewsDetector';
import { Message } from '../../src/database/models';

describe('CriticalNewsDetector', () => {
  let detector: CriticalNewsDetector;

  beforeEach(() => {
    detector = new CriticalNewsDetector();
  });

  const createTestMessage = (overrides: Partial<Message> = {}): Message => ({
    message_id: 1,
    telegram_message_id: BigInt(123),
    channel_id: 1,
    content: 'Тестовое сообщение',
    media_type: 'text',
    is_filtered: true,
    is_processed: false,
    importance_score: 50,
    created_at: new Date(),
    updated_at: new Date(),
    ...overrides,
  });

  describe('analyze', () => {
    it('должен определить критическое сообщение по высокому importance_score', async () => {
      const message = createTestMessage({
        importance_score: 90,
        content: 'Важная новость',
      });

      const result = await detector.analyze(message);

      expect(result.is_critical).toBe(true);
      expect(result.criticality_score).toBeGreaterThanOrEqual(80);
      expect(result.confidence).toBeGreaterThan(0.5);
      expect(result.recommended_action).toBe('immediate_notification');
    });

    it('должен определить критическое сообщение по ключевым словам', async () => {
      const message = createTestMessage({
        importance_score: 60,
        content: 'СРОЧНО! Произошла авария на АЭС',
      });

      const result = await detector.analyze(message);

      expect(result.is_critical).toBe(true);
      expect(result.factors.critical_keywords.length).toBeGreaterThan(0);
      expect(result.factors.critical_keywords).toContain('срочно');
      expect(result.factors.critical_keywords).toContain('авария');
      expect(
        result.reasons.some((r) => r.includes('критические ключевые слова')),
      ).toBe(true);
    });

    it('должен определить критическое сообщение по маркерам срочности', async () => {
      const message = createTestMessage({
        importance_score: 70,
        content: 'Breaking news: важное событие происходит прямо сейчас',
      });

      const result = await detector.analyze(message);

      expect(result.is_critical).toBe(true);
      expect(result.factors.urgency_markers.length).toBeGreaterThan(0);
      expect(result.factors.urgency_markers).toContain('прямо сейчас');
      expect(result.factors.breaking_news).toBe(true);
    });

    it('должен определить критическое сообщение по категории', async () => {
      const message = createTestMessage({
        importance_score: 70,
        category: 'emergency',
      });

      const result = await detector.analyze(message);

      expect(result.is_critical).toBe(true);
      expect(result.factors.critical_category).toBe(true);
    });

    it('должен определить тип чрезвычайной ситуации', async () => {
      const message = createTestMessage({
        content: 'Землетрясение магнитудой 7.0 произошло у берегов Японии',
      });

      const result = await detector.analyze(message);

      expect(result.factors.emergency_type).toBe('natural_disaster');
    });

    it('должен определить временную чувствительность', async () => {
      const tests = [
        {
          content: 'Breaking news: важное событие',
          expected: 'immediate',
        },
        {
          content: 'Срочно! Критическая ситуация',
          expected: 'urgent',
        },
        {
          content: 'Важная новость дня',
          expected: 'important',
        },
        {
          content: 'Обычная новость',
          expected: 'normal',
        },
      ];

      for (const test of tests) {
        const message = createTestMessage({ content: test.content });
        const result = await detector.analyze(message);
        expect(result.factors.time_sensitivity).toBe(test.expected);
      }
    });

    it('не должен определить обычное сообщение как критическое', async () => {
      const message = createTestMessage({
        importance_score: 30,
        content: 'Обычная новость без особых маркеров',
      });

      const result = await detector.analyze(message);

      expect(result.is_critical).toBe(false);
      expect(result.criticality_score).toBeLessThan(80);
      expect(result.recommended_action).toBe('no_notification');
    });

    it('должен обрабатывать ошибки корректно', async () => {
      const message = createTestMessage({
        content: null as any, // Некорректные данные
      });

      const result = await detector.analyze(message);

      expect(result.is_critical).toBe(false);
      expect(result.criticality_score).toBe(0);
      expect(result.confidence).toBe(0);
      expect(result.reasons.some((r) => r.includes('failed'))).toBe(true);
    });
  });

  describe('findCriticalKeywords', () => {
    it('должен находить критические ключевые слова', async () => {
      const message = createTestMessage({
        content:
          'Экстренно! Произошел теракт в центре города. Эвакуация началась немедленно.',
      });

      const result = await detector.analyze(message);

      expect(result.factors.critical_keywords).toContain('экстренно');
      expect(result.factors.critical_keywords).toContain('теракт');
      expect(result.factors.critical_keywords).toContain('эвакуация');
    });

    it('должен работать с английскими ключевыми словами', async () => {
      const message = createTestMessage({
        content: 'BREAKING: Emergency situation at nuclear facility',
      });

      const result = await detector.analyze(message);

      expect(result.factors.critical_keywords).toContain('breaking');
      expect(result.factors.critical_keywords).toContain('emergency');
    });
  });

  describe('detectBreakingNews', () => {
    it('должен определять breaking news', async () => {
      const tests = [
        'Breaking news: важное событие',
        'СРОЧНЫЕ НОВОСТИ',
        'Экстренные новости',
        'Just in: новая информация',
        'Последние новости',
      ];

      for (const content of tests) {
        const message = createTestMessage({ content });
        const result = await detector.analyze(message);
        expect(result.factors.breaking_news).toBe(true);
      }
    });
  });

  describe('calculateCriticalityScore', () => {
    it('должен правильно рассчитывать балл критичности', async () => {
      const testCases = [
        {
          message: createTestMessage({
            importance_score: 95,
            content: 'СРОЧНО! Землетрясение происходит сейчас!',
            category: 'emergency',
          }),
          expectedMin: 85,
        },
        {
          message: createTestMessage({
            importance_score: 50,
            content: 'Обычная новость дня',
          }),
          expectedMax: 60,
        },
      ];

      for (const testCase of testCases) {
        const result = await detector.analyze(testCase.message);

        if (testCase.expectedMin) {
          expect(result.criticality_score).toBeGreaterThanOrEqual(
            testCase.expectedMin,
          );
        }
        if (testCase.expectedMax) {
          expect(result.criticality_score).toBeLessThanOrEqual(
            testCase.expectedMax,
          );
        }
      }
    });
  });

  describe('updateConfig', () => {
    it('должен обновлять конфигурацию', () => {
      const newConfig: Partial<CriticalNewsConfig> = {
        critical_threshold: 75,
        emergency_threshold: 95,
        ai_weight: 0.5,
      };

      detector.updateConfig(newConfig);
      const config = detector.getConfig();

      expect(config.critical_threshold).toBe(75);
      expect(config.emergency_threshold).toBe(95);
      expect(config.ai_weight).toBe(0.5);
    });
  });

  describe('getConfig', () => {
    it('должен возвращать текущую конфигурацию', () => {
      const config = detector.getConfig();

      expect(config).toBeDefined();
      expect(config.critical_threshold).toBe(80);
      expect(config.emergency_threshold).toBe(90);
      expect(config.use_keyword_analysis).toBe(true);
    });
  });

  describe('determineRecommendedAction', () => {
    it('должен рекомендовать правильные действия', async () => {
      const testCases = [
        {
          importance_score: 95,
          expected: 'immediate_notification',
        },
        {
          importance_score: 85,
          expected: 'priority_notification',
        },
        {
          importance_score: 65,
          expected: 'standard_notification',
        },
        {
          importance_score: 45,
          expected: 'no_notification',
        },
      ];

      for (const testCase of testCases) {
        const message = createTestMessage({
          importance_score: testCase.importance_score,
        });

        const result = await detector.analyze(message);
        expect(result.recommended_action).toBe(testCase.expected);
      }
    });
  });

  describe('multiple language support', () => {
    it('должен работать с русскими и английскими текстами', async () => {
      const messages = [
        createTestMessage({
          content: 'СРОЧНО! Произошла авария на АЭС',
        }),
        createTestMessage({
          content: 'URGENT! Nuclear power plant accident occurred',
        }),
      ];

      for (const message of messages) {
        const result = await detector.analyze(message);
        expect(result.is_critical).toBe(true);
        expect(result.factors.critical_keywords.length).toBeGreaterThan(0);
      }
    });
  });

  describe('edge cases', () => {
    it('должен обрабатывать пустой контент', async () => {
      const message = createTestMessage({
        content: '',
        importance_score: 40,
      });

      const result = await detector.analyze(message);

      expect(result.is_critical).toBe(false);
      expect(result.factors.critical_keywords.length).toBe(0);
      expect(result.factors.urgency_markers.length).toBe(0);
    });

    it('должен обрабатывать очень длинный контент', async () => {
      const longContent = 'Срочно! '.repeat(100) + 'Важная новость';
      const message = createTestMessage({
        content: longContent,
        importance_score: 70,
      });

      const result = await detector.analyze(message);

      expect(result.is_critical).toBe(true);
      expect(result.factors.critical_keywords.length).toBeGreaterThan(0);
    });

    it('должен обрабатывать специальные символы', async () => {
      const message = createTestMessage({
        content: '🚨 СРОЧНО!!! Экстренная ситуация!!! 🔥💥',
        importance_score: 80,
      });

      const result = await detector.analyze(message);

      expect(result.is_critical).toBe(true);
      expect(result.factors.critical_keywords).toContain('срочно');
    });
  });
});
