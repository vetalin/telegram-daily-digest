import { OpenAI } from 'openai';
import { Logger } from '../utils/logger';
import { MessageAnalysis } from '../database/models/Message';

/**
 * Результат анализа категории контента
 */
export interface CategoryAnalysis {
  category: string;
  confidence: number;
  keywords: string[];
}

/**
 * Результат анализа важности контента
 */
export interface ImportanceAnalysis {
  score: number; // 0-100
  reasoning: string;
  factors: string[];
}

/**
 * Полный результат ИИ анализа
 */
export interface AIAnalysisResult {
  importance: ImportanceAnalysis;
  category: CategoryAnalysis;
  sentiment: 'positive' | 'negative' | 'neutral';
  keywords: string[];
  isSpam: boolean;
  isAd: boolean;
  summary?: string;
}

/**
 * Конфигурация для AIAnalysisService
 */
export interface AIAnalysisConfig {
  openaiApiKey: string;
  model?: string;
  maxTokens?: number;
  temperature?: number;
}

/**
 * Сервис для ИИ анализа контента с использованием OpenAI API
 */
export class AIAnalysisService {
  private openai: OpenAI;
  private logger: Logger;
  private config: Required<AIAnalysisConfig>;

  // Категории новостей
  private readonly categories = [
    'политика',
    'экономика', 
    'технологии',
    'наука',
    'спорт',
    'культура',
    'медицина',
    'происшествия',
    'международные новости',
    'общество',
    'криптовалюты',
    'финансы',
    'образование',
    'экология',
    'другое'
  ];

  constructor(config: AIAnalysisConfig) {
    this.config = {
      model: 'gpt-3.5-turbo',
      maxTokens: 1000,
      temperature: 0.3,
      ...config
    };

    this.openai = new OpenAI({
      apiKey: this.config.openaiApiKey,
    });

    this.logger = new Logger('AIAnalysisService');
  }

  /**
   * Основной метод анализа контента
   */
  async analyzeContent(
    content: string,
    channelTitle?: string,
    mediaType?: string
  ): Promise<AIAnalysisResult> {
    try {
      this.logger.debug('Начало анализа контента', {
        contentLength: content.length,
        channelTitle,
        mediaType
      });

      // Создаем промпт для анализа
      const prompt = this.createAnalysisPrompt(content, channelTitle, mediaType);

      // Выполняем запрос к OpenAI
      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: this.getSystemPrompt()
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: this.config.maxTokens,
        temperature: this.config.temperature,
        response_format: { type: 'json_object' }
      });

      const responseContent = response.choices[0]?.message?.content;
      if (!responseContent) {
        throw new Error('Пустой ответ от OpenAI API');
      }

      // Парсим JSON ответ
      const analysisData = JSON.parse(responseContent);
      
      // Валидируем и преобразуем результат
      const result = this.validateAndTransformResponse(analysisData);

      this.logger.debug('Анализ завершен', {
        category: result.category.category,
        importance: result.importance.score,
        sentiment: result.sentiment
      });

      return result;

    } catch (error) {
      this.logger.error('Ошибка при анализе контента', { error });
      
      // Возвращаем fallback результат
      return this.getFallbackAnalysis(content);
    }
  }

  /**
   * Анализ только важности сообщения (быстрый метод)
   */
  async analyzeImportance(content: string, channelTitle?: string): Promise<number> {
    try {
      const prompt = `Оцени важность данного сообщения от 0 до 100:
      
Канал: ${channelTitle || 'неизвестно'}
Сообщение: "${content}"

Верни только число от 0 до 100.`;

      const response = await this.openai.chat.completions.create({
        model: this.config.model,
        messages: [
          {
            role: 'system',
            content: 'Ты эксперт по оценке важности новостей. Возвращай только числовую оценку от 0 до 100.'
          },
          {
            role: 'user',
            content: prompt
          }
        ],
        max_tokens: 10,
        temperature: 0.1
      });

      const scoreText = response.choices[0]?.message?.content?.trim();
      const score = parseInt(scoreText || '0', 10);

      return Math.max(0, Math.min(100, score));

    } catch (error) {
      this.logger.error('Ошибка при анализе важности', { error });
      return this.calculateFallbackImportance(content);
    }
  }

  /**
   * Создание промпта для анализа
   */
  private createAnalysisPrompt(content: string, channelTitle?: string, mediaType?: string): string {
    return `Проанализируй следующее сообщение из Telegram канала:

Канал: ${channelTitle || 'неизвестно'}
Тип контента: ${mediaType || 'text'}
Сообщение: "${content}"

Проведи комплексный анализ и верни результат в JSON формате с полями:
- importance: { score: число 0-100, reasoning: строка, factors: массив строк }
- category: { category: одна из категорий, confidence: число 0-1, keywords: массив ключевых слов }
- sentiment: "positive" | "negative" | "neutral"
- keywords: массив ключевых слов (3-7 слов)
- isSpam: boolean
- isAd: boolean
- summary: краткое содержание (опционально)

Доступные категории: ${this.categories.join(', ')}`;
  }

  /**
   * Системный промпт для настройки ИИ
   */
  private getSystemPrompt(): string {
    return `Ты эксперт по анализу новостного контента из российских Telegram каналов. 

Твоя задача:
1. Оценить важность новости (0-100) на основе актуальности, социальной значимости, влияния на аудиторию
2. Определить категорию контента
3. Извлечь ключевые слова
4. Определить тональность (положительная/отрицательная/нейтральная)
5. Выявить спам и рекламу

Критерии важности:
- 90-100: экстренные новости, крупные события, влияющие на многих людей
- 70-89: важные новости регионального/отраслевого значения  
- 50-69: интересные новости средней важности
- 30-49: малозначимые новости
- 0-29: развлекательный контент, личные мнения, спам

Всегда возвращай валидный JSON без дополнительных комментариев.`;
  }

  /**
   * Валидация и преобразование ответа от ИИ
   */
  private validateAndTransformResponse(data: any): AIAnalysisResult {
    // Валидация структуры
    if (!data.importance || !data.category) {
      throw new Error('Неверная структура ответа от ИИ');
    }

    // Валидация важности
    const importanceScore = Math.max(0, Math.min(100, parseInt(data.importance.score) || 0));
    
    // Валидация категории
    const category = this.categories.includes(data.category.category) 
      ? data.category.category 
      : 'другое';

    // Валидация тональности
    const validSentiments = ['positive', 'negative', 'neutral'];
    const sentiment = validSentiments.includes(data.sentiment) 
      ? data.sentiment 
      : 'neutral';

    return {
      importance: {
        score: importanceScore,
        reasoning: data.importance.reasoning || 'Автоматическая оценка',
        factors: Array.isArray(data.importance.factors) ? data.importance.factors : []
      },
      category: {
        category,
        confidence: Math.max(0, Math.min(1, parseFloat(data.category.confidence) || 0.5)),
        keywords: Array.isArray(data.category.keywords) ? data.category.keywords : []
      },
      sentiment,
      keywords: Array.isArray(data.keywords) ? data.keywords : [],
      isSpam: Boolean(data.isSpam),
      isAd: Boolean(data.isAd),
      summary: data.summary || undefined
    };
  }

  /**
   * Fallback анализ при ошибке ИИ
   */
  private getFallbackAnalysis(content: string): AIAnalysisResult {
    const importance = this.calculateFallbackImportance(content);
    const keywords = this.extractSimpleKeywords(content);
    
    return {
      importance: {
        score: importance,
        reasoning: 'Базовый анализ (ИИ недоступен)',
        factors: ['Длина сообщения', 'Наличие ключевых слов']
      },
      category: {
        category: 'другое',
        confidence: 0.3,
        keywords
      },
      sentiment: 'neutral',
      keywords,
      isSpam: false,
      isAd: false
    };
  }

  /**
   * Простой расчет важности без ИИ
   */
  private calculateFallbackImportance(content: string): number {
    let score = 30; // базовая оценка

    // Увеличиваем за длину
    if (content.length > 200) score += 10;
    if (content.length > 500) score += 10;

    // Увеличиваем за ключевые слова высокой важности
    const importantKeywords = [
      'срочно', 'экстренно', 'важно', 'внимание',
      'президент', 'правительство', 'дума',
      'война', 'конфликт', 'теракт', 'авария',
      'курс', 'доллар', 'рубль', 'инфляция'
    ];

    const lowercaseContent = content.toLowerCase();
    const matchedKeywords = importantKeywords.filter(keyword => 
      lowercaseContent.includes(keyword)
    );

    score += matchedKeywords.length * 15;

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Простое извлечение ключевых слов
   */
  private extractSimpleKeywords(content: string): string[] {
    const words = content
      .toLowerCase()
      .replace(/[^\w\sа-яё]/gi, '')
      .split(/\s+/)
      .filter(word => word.length > 3);

    // Простая частотная статистика
    const wordCount = new Map<string, number>();
    words.forEach(word => {
      wordCount.set(word, (wordCount.get(word) || 0) + 1);
    });

    // Возвращаем самые частые слова
    return Array.from(wordCount.entries())
      .sort((a, b) => b[1] - a[1])
      .slice(0, 5)
      .map(([word]) => word);
  }

  /**
   * Получение статистики использования сервиса
   */
  getUsageStats() {
    return {
      availableCategories: this.categories.length,
      model: this.config.model,
      maxTokens: this.config.maxTokens
    };
  }
}

// Экспорт singleton instance (будет создан при первом обращении)
let aiAnalysisServiceInstance: AIAnalysisService | null = null;

export function getAIAnalysisService(): AIAnalysisService {
  if (!aiAnalysisServiceInstance) {
    const apiKey = process.env.OPENAI_API_KEY;
    if (!apiKey) {
      throw new Error('OPENAI_API_KEY не найден в переменных окружения');
    }

    aiAnalysisServiceInstance = new AIAnalysisService({
      openaiApiKey: apiKey,
      model: process.env.AI_MODEL || 'gpt-3.5-turbo',
      maxTokens: parseInt(process.env.AI_MAX_TOKENS || '1000'),
      temperature: parseFloat(process.env.AI_TEMPERATURE || '0.3')
    });
  }

  return aiAnalysisServiceInstance;
}