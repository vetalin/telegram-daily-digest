import { Logger } from '../utils/logger';
import { AIAnalysisResult } from './AIAnalysisService';

/**
 * Факторы, влияющие на важность новости
 */
export interface ScoreFactors {
  // Контентные факторы
  contentLength: number;
  hasNumbers: boolean;
  hasKeywords: boolean;
  hasUrls: boolean;
  hasMediaAttachment: boolean;
  
  // ИИ факторы
  aiImportanceScore: number;
  aiCategory: string;
  aiSentiment: 'positive' | 'negative' | 'neutral';
  aiKeywordsCount: number;
  
  // Канальные факторы
  channelReliability: number; // 0-1, насколько надежен источник
  channelSubscribers?: number;
  isVerifiedChannel: boolean;
  
  // Временные факторы
  timeOfDay: number; // 0-23 часа
  isBreakingNews: boolean;
}

/**
 * Результат scoring анализа
 */
export interface NewsScore {
  finalScore: number; // 0-100, итоговый балл важности
  breakdown: {
    contentScore: number;
    aiScore: number;
    sourceScore: number;
    timelinesScore: number;
  };
  reasoning: string[];
  classification: 'critical' | 'high' | 'medium' | 'low' | 'minimal';
}

/**
 * Конфигурация весов для scoring системы
 */
export interface ScoringWeights {
  aiWeight: number;        // Вес ИИ анализа (рекомендуется 0.4-0.6)
  contentWeight: number;   // Вес контентного анализа (рекомендуется 0.2-0.3)
  sourceWeight: number;    // Вес источника (рекомендуется 0.1-0.2)
  timelinessWeight: number; // Вес актуальности (рекомендуется 0.1-0.2)
}

/**
 * Сервис для расчета важности новостей на основе множественных факторов
 */
export class NewsScoreService {
  private logger: Logger;
  private weights: ScoringWeights;

  // Ключевые слова высокой важности
  private readonly criticalKeywords = [
    'срочно', 'экстренно', 'важно', 'внимание', 'алерт',
    'breaking', 'urgent', 'critical'
  ];

  private readonly highImportanceKeywords = [
    // Политика и власть
    'президент', 'правительство', 'дума', 'министр', 'губернатор',
    'закон', 'указ', 'постановление', 'выборы', 'референдум',
    
    // Экономика и финансы
    'курс', 'доллар', 'евро', 'рубль', 'инфляция', 'цб', 'банк россии',
    'санкции', 'нефть', 'газ', 'бюджет', 'налоги',
    
    // Безопасность и ЧС
    'война', 'конфликт', 'теракт', 'авария', 'катастрофа',
    'пожар', 'наводнение', 'землетрясение', 'эвакуация',
    
    // Здоровье
    'covid', 'коронавирус', 'пандемия', 'эпидемия', 'заболевание',
    'вакцина', 'карантин', 'больница', 'врачи'
  ];

  private readonly mediumImportanceKeywords = [
    'технологии', 'наука', 'исследование', 'открытие',
    'спорт', 'чемпионат', 'олимпиада', 'футбол',
    'культура', 'фестиваль', 'концерт', 'выставка'
  ];

  // Паттерны для определения breaking news
  private readonly breakingNewsPatterns = [
    /срочн[ая-ые]/i,
    /только что/i,
    /минуту назад/i,
    /происходит сейчас/i,
    /в прямом эфире/i,
    /молния/i,
    /⚡/
  ];

  constructor(weights?: Partial<ScoringWeights>) {
    this.logger = new Logger('NewsScoreService');
    
    // Дефолтные веса (сумма должна равняться 1.0)
    this.weights = {
      aiWeight: 0.5,        // 50% - основной вес на ИИ анализе
      contentWeight: 0.25,  // 25% - анализ контента
      sourceWeight: 0.15,   // 15% - надежность источника  
      timelinessWeight: 0.1, // 10% - актуальность/время
      ...weights
    };

    this.validateWeights();
  }

  /**
   * Основной метод расчета важности новости
   */
  async calculateScore(
    content: string,
    aiAnalysis: AIAnalysisResult,
    channelName?: string,
    channelSubscribers?: number,
    isVerified: boolean = false,
    mediaType?: string
  ): Promise<NewsScore> {
    
    this.logger.debug('Начало расчета score для новости', {
      contentLength: content.length,
      channelName,
      aiCategory: aiAnalysis.category.category
    });

    // Подготавливаем факторы
    const factors = this.extractFactors(
      content, 
      aiAnalysis, 
      channelName, 
      channelSubscribers, 
      isVerified,
      mediaType
    );

    // Рассчитываем компоненты score
    const contentScore = this.calculateContentScore(factors);
    const aiScore = this.normalizeAIScore(factors.aiImportanceScore);
    const sourceScore = this.calculateSourceScore(factors);
    const timelinesScore = this.calculateTimelinessScore(factors);

    // Вычисляем итоговый взвешенный score
    const finalScore = Math.round(
      contentScore * this.weights.contentWeight +
      aiScore * this.weights.aiWeight +
      sourceScore * this.weights.sourceWeight +
      timelinesScore * this.weights.timelinessWeight
    );

    // Создаем объяснение
    const reasoning = this.generateReasoning(factors, {
      contentScore,
      aiScore, 
      sourceScore,
      timelinesScore
    });

    // Определяем классификацию
    const classification = this.classifyImportance(finalScore);

    const result: NewsScore = {
      finalScore: Math.max(0, Math.min(100, finalScore)),
      breakdown: {
        contentScore,
        aiScore,
        sourceScore,
        timelinesScore
      },
      reasoning,
      classification
    };

    this.logger.debug('Score рассчитан', {
      finalScore: result.finalScore,
      classification: result.classification,
      breakdown: result.breakdown
    });

    return result;
  }

  /**
   * Извлечение факторов из контента и метаданных
   */
  private extractFactors(
    content: string,
    aiAnalysis: AIAnalysisResult,
    channelName?: string,
    channelSubscribers?: number,
    isVerified: boolean = false,
    mediaType?: string
  ): ScoreFactors {
    const now = new Date();
    
    return {
      // Контентные факторы
      contentLength: content.length,
      hasNumbers: /\d/.test(content),
      hasKeywords: this.hasImportantKeywords(content),
      hasUrls: /https?:\/\//.test(content),
      hasMediaAttachment: mediaType !== 'text',
      
      // ИИ факторы
      aiImportanceScore: aiAnalysis.importance.score,
      aiCategory: aiAnalysis.category.category,
      aiSentiment: aiAnalysis.sentiment,
      aiKeywordsCount: aiAnalysis.keywords.length,
      
      // Канальные факторы  
      channelReliability: this.calculateChannelReliability(channelName, isVerified),
      channelSubscribers,
      isVerifiedChannel: isVerified,
      
      // Временные факторы
      timeOfDay: now.getHours(),
      isBreakingNews: this.isBreakingNews(content)
    };
  }

  /**
   * Расчет контентного score (0-100)
   */
  private calculateContentScore(factors: ScoreFactors): number {
    let score = 0;

    // Длина контента
    if (factors.contentLength > 100) score += 10;
    if (factors.contentLength > 300) score += 10;
    if (factors.contentLength > 500) score += 10;

    // Ключевые слова
    if (factors.hasKeywords) score += 20;

    // Наличие чисел (даты, статистика)
    if (factors.hasNumbers) score += 10;

    // Наличие ссылок
    if (factors.hasUrls) score += 5;

    // Медиа контент
    if (factors.hasMediaAttachment) score += 10;

    // Breaking news
    if (factors.isBreakingNews) score += 25;

    return Math.min(100, score);
  }

  /**
   * Нормализация ИИ score к шкале 0-100
   */
  private normalizeAIScore(aiScore: number): number {
    return Math.max(0, Math.min(100, aiScore));
  }

  /**
   * Расчет score источника (0-100)
   */
  private calculateSourceScore(factors: ScoreFactors): number {
    let score = 50; // базовый уровень

    // Надежность канала
    score += factors.channelReliability * 30;

    // Верификация
    if (factors.isVerifiedChannel) score += 15;

    // Количество подписчиков (если доступно)
    if (factors.channelSubscribers) {
      if (factors.channelSubscribers > 1000) score += 5;
      if (factors.channelSubscribers > 10000) score += 5;
      if (factors.channelSubscribers > 100000) score += 5;
    }

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Расчет актуальности (0-100)
   */
  private calculateTimelinessScore(factors: ScoreFactors): number {
    let score = 50; // базовый уровень

    // Breaking news получает максимальный балл
    if (factors.isBreakingNews) return 100;

    // Время дня (новости в рабочее время более актуальны)
    const hour = factors.timeOfDay;
    if (hour >= 8 && hour <= 22) score += 20; // дневное время
    if (hour >= 9 && hour <= 18) score += 10; // рабочее время

    return Math.max(0, Math.min(100, score));
  }

  /**
   * Проверка наличия важных ключевых слов
   */
  private hasImportantKeywords(content: string): boolean {
    const lowercaseContent = content.toLowerCase();
    
    // Критические ключевые слова
    for (const keyword of this.criticalKeywords) {
      if (lowercaseContent.includes(keyword)) return true;
    }

    // Высокоприоритетные ключевые слова
    for (const keyword of this.highImportanceKeywords) {
      if (lowercaseContent.includes(keyword)) return true;
    }

    return false;
  }

  /**
   * Расчет надежности канала (0-1)
   */
  private calculateChannelReliability(channelName?: string, isVerified: boolean = false): number {
    if (!channelName) return 0.5; // нейтральная надежность

    let reliability = 0.5; // базовая надежность

    // Верифицированные каналы более надежны
    if (isVerified) reliability += 0.3;

    const lowerChannelName = channelName.toLowerCase();

    // Известные надежные источники
    const reliableSources = [
      'рбк', 'ria', 'тасс', 'интерфакс', 'коммерсант', 'ведомости',
      'russia today', 'rt', 'вгтрк', 'первый канал'
    ];

    // Сомнительные источники  
    const unreliableSources = [
      'аноним', 'слухи', 'неофициальный', 'неподтвержден'
    ];

    // Проверяем на надежность
    for (const source of reliableSources) {
      if (lowerChannelName.includes(source)) {
        reliability = Math.min(1.0, reliability + 0.3);
        break;
      }
    }

    // Проверяем на ненадежность
    for (const source of unreliableSources) {
      if (lowerChannelName.includes(source)) {
        reliability = Math.max(0.1, reliability - 0.4);
        break;
      }
    }

    return reliability;
  }

  /**
   * Определение breaking news
   */
  private isBreakingNews(content: string): boolean {
    return this.breakingNewsPatterns.some(pattern => pattern.test(content));
  }

  /**
   * Генерация объяснения score
   */
  private generateReasoning(
    factors: ScoreFactors, 
    scores: { contentScore: number; aiScore: number; sourceScore: number; timelinesScore: number }
  ): string[] {
    const reasoning: string[] = [];

    // ИИ анализ
    reasoning.push(`ИИ оценка важности: ${factors.aiImportanceScore}/100`);
    reasoning.push(`Категория: ${factors.aiCategory}`);

    // Контент
    if (factors.isBreakingNews) reasoning.push('⚡ Экстренная новость');
    if (factors.hasKeywords) reasoning.push('Содержит важные ключевые слова');
    if (factors.contentLength > 300) reasoning.push('Подробный контент');

    // Источник
    if (factors.isVerifiedChannel) reasoning.push('Верифицированный канал');
    if (factors.channelReliability > 0.7) reasoning.push('Надежный источник');

    // Итоговые компоненты
    reasoning.push(`Компоненты: контент=${scores.contentScore}, ИИ=${scores.aiScore}, источник=${scores.sourceScore}, время=${scores.timelinesScore}`);

    return reasoning;
  }

  /**
   * Классификация важности по итоговому score
   */
  private classifyImportance(score: number): 'critical' | 'high' | 'medium' | 'low' | 'minimal' {
    if (score >= 85) return 'critical';
    if (score >= 70) return 'high';
    if (score >= 50) return 'medium';
    if (score >= 30) return 'low';
    return 'minimal';
  }

  /**
   * Валидация весов
   */
  private validateWeights(): void {
    const total = Object.values(this.weights).reduce((sum, weight) => sum + weight, 0);
    const tolerance = 0.01; // допустимая погрешность

    if (Math.abs(total - 1.0) > tolerance) {
      this.logger.warn('Сумма весов не равна 1.0', { 
        weights: this.weights, 
        total 
      });
    }
  }

  /**
   * Обновление весов scoring системы
   */
  updateWeights(newWeights: Partial<ScoringWeights>): void {
    this.weights = { ...this.weights, ...newWeights };
    this.validateWeights();
    this.logger.info('Веса scoring системы обновлены', { weights: this.weights });
  }

  /**
   * Получение текущих весов
   */
  getWeights(): ScoringWeights {
    return { ...this.weights };
  }

  /**
   * Статистика scoring системы
   */
  getStats() {
    return {
      weights: this.weights,
      criticalKeywordsCount: this.criticalKeywords.length,
      highImportanceKeywordsCount: this.highImportanceKeywords.length,
      mediumImportanceKeywordsCount: this.mediumImportanceKeywords.length,
      breakingNewsPatternsCount: this.breakingNewsPatterns.length
    };
  }
}

// Экспорт единственного экземпляра
export const newsScoreService = new NewsScoreService();