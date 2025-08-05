/**
 * CriticalNewsDetector - специализированный детектор критических новостей
 * Использует комбинацию ИИ анализа и эвристических правил
 */

import { AIAnalysisService, ImportanceAnalysis } from '../ai/AIAnalysisService';
import { Message, User } from '../database/models';
import { createLogger } from '../utils/logger';
import { Logger } from 'winston';

export interface CriticalityFactors {
  importance_score: number;
  ai_reasoning?: string;
  critical_keywords: string[];
  urgency_markers: string[];
  critical_category: boolean;
  breaking_news: boolean;
  emergency_type?: EmergencyType;
  geographic_relevance?: GeographicRelevance;
  time_sensitivity: TimeSensitivity;
}

export interface CriticalNewsResult {
  is_critical: boolean;
  criticality_score: number; // 0-100
  confidence: number; // 0-1
  factors: CriticalityFactors;
  reasons: string[];
  recommended_action: RecommendedAction;
}

export type EmergencyType =
  | 'natural_disaster'
  | 'terrorism'
  | 'war'
  | 'health_emergency'
  | 'infrastructure_failure'
  | 'economic_crisis'
  | 'political_crisis'
  | 'cyber_attack'
  | 'environmental_disaster';

export interface GeographicRelevance {
  is_local: boolean;
  is_national: boolean;
  is_global: boolean;
  affected_regions: string[];
}

export type TimeSensitivity = 'immediate' | 'urgent' | 'important' | 'normal';

export type RecommendedAction =
  | 'immediate_notification'
  | 'priority_notification'
  | 'standard_notification'
  | 'no_notification';

export interface CriticalNewsConfig {
  // Пороги критичности
  critical_threshold: number; // 80
  emergency_threshold: number; // 90

  // Весовые коэффициенты
  ai_weight: number; // 0.6
  keywords_weight: number; // 0.3
  category_weight: number; // 0.1

  // Временные настройки
  breaking_news_window_hours: number; // 2

  // Включение/отключение компонентов
  use_ai_analysis: boolean;
  use_keyword_analysis: boolean;
  use_category_analysis: boolean;
}

export class CriticalNewsDetector {
  private logger: Logger;
  private aiService?: AIAnalysisService;
  private config: CriticalNewsConfig;

  // Словари критических ключевых слов по категориям
  private readonly criticalKeywords = {
    emergency: [
      'экстренно',
      'срочно',
      'внимание',
      'важно',
      'критично',
      'чрезвычайная ситуация',
      'ЧС',
      'катастрофа',
      'авария',
      'emergency',
      'urgent',
      'critical',
      'breaking',
    ],
    disaster: [
      'землетрясение',
      'цунами',
      'наводнение',
      'пожар',
      'ураган',
      'торнадо',
      'извержение',
      'оползень',
      'лавина',
      'засуха',
      'earthquake',
      'tsunami',
      'flood',
      'fire',
      'hurricane',
    ],
    security: [
      'теракт',
      'террор',
      'взрыв',
      'стрельба',
      'нападение',
      'захват',
      'заложники',
      'угроза',
      'эвакуация',
      'блокировка',
      'terrorism',
      'attack',
      'shooting',
      'threat',
      'evacuation',
    ],
    war: [
      'война',
      'военные действия',
      'обстрел',
      'бомбардировка',
      'мобилизация',
      'военное положение',
      'конфликт',
      'вторжение',
      'war',
      'military action',
      'bombing',
      'mobilization',
      'conflict',
    ],
    health: [
      'эпидемия',
      'пандемия',
      'вирус',
      'заражение',
      'карантин',
      'вспышка',
      'болезнь',
      'смертельный',
      'токсичный',
      'отравление',
      'pandemic',
      'epidemic',
      'virus',
      'outbreak',
      'quarantine',
    ],
    infrastructure: [
      'отключение',
      'блэкаут',
      'авария на станции',
      'разрушение моста',
      'отказ системы',
      'сбой',
      'транспортный коллапс',
      'энергосистема',
      'blackout',
      'power outage',
      'system failure',
      'infrastructure collapse',
    ],
    economic: [
      'обвал',
      'кризис',
      'дефолт',
      'банкротство',
      'девальвация',
      'гиперинфляция',
      'экономический коллапс',
      'финансовый кризис',
      'crash',
      'crisis',
      'default',
      'bankruptcy',
      'devaluation',
    ],
  };

  private readonly urgencyMarkers = [
    'прямо сейчас',
    'в данный момент',
    'происходит сейчас',
    'только что',
    'немедленно',
    'в эту минуту',
    'на данный момент',
    'right now',
    'happening now',
    'just in',
    'breaking news',
    'live update',
    'developing story',
  ];

  private readonly criticalCategories = [
    'breaking_news',
    'emergency',
    'disaster',
    'security',
    'health_alert',
    'government_alert',
    'weather_emergency',
    'military_action',
    'terrorism',
    'natural_disaster',
  ];

  constructor(
    aiService?: AIAnalysisService,
    config?: Partial<CriticalNewsConfig>,
  ) {
    this.logger = createLogger('CriticalNewsDetector');
    this.aiService = aiService;

    this.config = {
      critical_threshold: 80,
      emergency_threshold: 90,
      ai_weight: 0.6,
      keywords_weight: 0.3,
      category_weight: 0.1,
      breaking_news_window_hours: 2,
      use_ai_analysis: !!aiService,
      use_keyword_analysis: true,
      use_category_analysis: true,
      ...config,
    };
  }

  /**
   * Основной метод для анализа критичности новости
   */
  async analyze(message: Message, user?: User): Promise<CriticalNewsResult> {
    try {
      this.logger.debug('Analyzing message for criticality', {
        message_id: message.message_id,
      });

      const factors = await this.extractCriticalityFactors(message);
      const criticality_score = this.calculateCriticalityScore(factors);
      const confidence = this.calculateConfidence(factors);
      const is_critical = criticality_score >= this.config.critical_threshold;
      const reasons = this.generateReasons(factors, criticality_score);
      const recommended_action = this.determineRecommendedAction(
        criticality_score,
        factors,
      );

      const result: CriticalNewsResult = {
        is_critical,
        criticality_score,
        confidence,
        factors,
        reasons,
        recommended_action,
      };

      this.logger.debug('Criticality analysis completed', {
        message_id: message.message_id,
        is_critical,
        criticality_score,
        confidence,
      });

      return result;
    } catch (error) {
      this.logger.error('Error analyzing message criticality', {
        error,
        message_id: message.message_id,
      });

      return {
        is_critical: false,
        criticality_score: 0,
        confidence: 0,
        factors: this.getEmptyFactors(),
        reasons: ['Analysis failed due to error'],
        recommended_action: 'no_notification',
      };
    }
  }

  /**
   * Извлекает факторы критичности из сообщения
   */
  private async extractCriticalityFactors(
    message: Message,
  ): Promise<CriticalityFactors> {
    const factors: CriticalityFactors = {
      importance_score: message.importance_score || 0,
      critical_keywords: [],
      urgency_markers: [],
      critical_category: false,
      breaking_news: false,
      time_sensitivity: 'normal',
    };

    // Анализ ключевых слов
    if (this.config.use_keyword_analysis && message.content) {
      factors.critical_keywords = this.findCriticalKeywords(message.content);
      factors.urgency_markers = this.findUrgencyMarkers(message.content);
      factors.breaking_news = this.detectBreakingNews(message.content);
      factors.emergency_type = this.detectEmergencyType(
        message.content,
        factors.critical_keywords,
      );
    }

    // Анализ категории
    if (this.config.use_category_analysis && message.category) {
      factors.critical_category = this.criticalCategories.includes(
        message.category.toLowerCase(),
      );
    }

    // Определение временной чувствительности
    factors.time_sensitivity = this.determineTimeSensitivity(factors);

    // ИИ анализ (если доступен)
    if (this.config.use_ai_analysis && this.aiService && message.content) {
      try {
        const aiAnalysis = await this.performAIAnalysis(message.content);
        if (aiAnalysis) {
          factors.ai_reasoning = aiAnalysis.reasoning;
          // Можем скорректировать importance_score на основе ИИ анализа
          factors.importance_score = Math.max(
            factors.importance_score,
            aiAnalysis.score,
          );
        }
      } catch (error) {
        this.logger.warn('AI analysis failed, falling back to heuristics', {
          error,
          message_id: message.message_id,
        });
      }
    }

    return factors;
  }

  /**
   * Находит критические ключевые слова в тексте
   */
  private findCriticalKeywords(content: string): string[] {
    const text = content.toLowerCase();
    const found: string[] = [];

    for (const [category, keywords] of Object.entries(this.criticalKeywords)) {
      for (const keyword of keywords) {
        if (text.includes(keyword.toLowerCase())) {
          found.push(keyword);
        }
      }
    }

    return [...new Set(found)]; // Убираем дубликаты
  }

  /**
   * Находит маркеры срочности в тексте
   */
  private findUrgencyMarkers(content: string): string[] {
    const text = content.toLowerCase();
    return this.urgencyMarkers.filter((marker) =>
      text.includes(marker.toLowerCase()),
    );
  }

  /**
   * Определяет, является ли новость "breaking news"
   */
  private detectBreakingNews(content: string): boolean {
    const text = content.toLowerCase();
    const breakingMarkers = [
      'breaking',
      'срочные новости',
      'экстренные новости',
      'только что',
      'just in',
      'developing',
      'последние новости',
    ];

    return breakingMarkers.some((marker) => text.includes(marker));
  }

  /**
   * Определяет тип чрезвычайной ситуации
   */
  private detectEmergencyType(
    content: string,
    keywords: string[],
  ): EmergencyType | undefined {
    const text = content.toLowerCase();

    if (keywords.some((k) => this.criticalKeywords.disaster.includes(k))) {
      return 'natural_disaster';
    }
    if (keywords.some((k) => this.criticalKeywords.security.includes(k))) {
      return 'terrorism';
    }
    if (keywords.some((k) => this.criticalKeywords.war.includes(k))) {
      return 'war';
    }
    if (keywords.some((k) => this.criticalKeywords.health.includes(k))) {
      return 'health_emergency';
    }
    if (
      keywords.some((k) => this.criticalKeywords.infrastructure.includes(k))
    ) {
      return 'infrastructure_failure';
    }
    if (keywords.some((k) => this.criticalKeywords.economic.includes(k))) {
      return 'economic_crisis';
    }

    return undefined;
  }

  /**
   * Определяет временную чувствительность
   */
  private determineTimeSensitivity(
    factors: CriticalityFactors,
  ): TimeSensitivity {
    if (factors.urgency_markers.length > 0 || factors.breaking_news) {
      return 'immediate';
    }
    if (factors.critical_keywords.length > 2 || factors.importance_score > 85) {
      return 'urgent';
    }
    if (factors.critical_keywords.length > 0 || factors.importance_score > 70) {
      return 'important';
    }
    return 'normal';
  }

  /**
   * Выполняет ИИ анализ контента
   */
  private async performAIAnalysis(
    content: string,
  ): Promise<ImportanceAnalysis | null> {
    if (!this.aiService) {
      return null;
    }

    try {
      const analysis = await this.aiService.analyzeContent(content);
      return analysis.importance;
    } catch (error) {
      this.logger.warn('AI analysis failed', { error });
      return null;
    }
  }

  /**
   * Рассчитывает общий балл критичности
   */
  private calculateCriticalityScore(factors: CriticalityFactors): number {
    let score = 0;

    // Базовый балл от ИИ анализа важности
    const aiScore = factors.importance_score * this.config.ai_weight;
    score += aiScore;

    // Баллы за критические ключевые слова
    const keywordScore =
      Math.min(
        factors.critical_keywords.length * 15 +
          factors.urgency_markers.length * 10,
        40,
      ) * this.config.keywords_weight;
    score += keywordScore;

    // Баллы за категорию
    const categoryScore = factors.critical_category ? 20 : 0;
    score += categoryScore * this.config.category_weight;

    // Бонусы за специальные условия
    if (factors.breaking_news) score += 15;
    if (factors.emergency_type) score += 10;
    if (factors.time_sensitivity === 'immediate') score += 10;
    if (factors.time_sensitivity === 'urgent') score += 5;

    return Math.min(Math.round(score), 100);
  }

  /**
   * Рассчитывает уверенность в анализе
   */
  private calculateConfidence(factors: CriticalityFactors): number {
    let confidence = 0.5; // Базовая уверенность

    // Увеличиваем уверенность, если есть ИИ анализ
    if (factors.ai_reasoning) confidence += 0.3;

    // Увеличиваем уверенность за количество найденных индикаторов
    const indicators =
      factors.critical_keywords.length +
      factors.urgency_markers.length +
      (factors.critical_category ? 1 : 0) +
      (factors.breaking_news ? 1 : 0);

    confidence += Math.min(indicators * 0.1, 0.4);

    return Math.min(confidence, 1.0);
  }

  /**
   * Генерирует причины определения критичности
   */
  private generateReasons(
    factors: CriticalityFactors,
    score: number,
  ): string[] {
    const reasons: string[] = [];

    if (factors.importance_score >= 85) {
      reasons.push(`Высокий балл важности от ИИ: ${factors.importance_score}`);
    }

    if (factors.critical_keywords.length > 0) {
      reasons.push(
        `Найдены критические ключевые слова: ${factors.critical_keywords.join(', ')}`,
      );
    }

    if (factors.urgency_markers.length > 0) {
      reasons.push(
        `Найдены маркеры срочности: ${factors.urgency_markers.join(', ')}`,
      );
    }

    if (factors.critical_category) {
      reasons.push('Сообщение относится к критической категории');
    }

    if (factors.breaking_news) {
      reasons.push('Определено как экстренная новость');
    }

    if (factors.emergency_type) {
      reasons.push(`Тип чрезвычайной ситуации: ${factors.emergency_type}`);
    }

    if (factors.time_sensitivity === 'immediate') {
      reasons.push('Требует немедленного внимания');
    }

    if (reasons.length === 0 && score >= this.config.critical_threshold) {
      reasons.push('Комбинация факторов указывает на критичность');
    }

    return reasons;
  }

  /**
   * Определяет рекомендуемое действие
   */
  private determineRecommendedAction(
    score: number,
    factors: CriticalityFactors,
  ): RecommendedAction {
    if (score >= this.config.emergency_threshold) {
      return 'immediate_notification';
    }
    if (score >= this.config.critical_threshold) {
      return 'priority_notification';
    }
    if (score >= 60) {
      return 'standard_notification';
    }
    return 'no_notification';
  }

  /**
   * Возвращает пустые факторы критичности
   */
  private getEmptyFactors(): CriticalityFactors {
    return {
      importance_score: 0,
      critical_keywords: [],
      urgency_markers: [],
      critical_category: false,
      breaking_news: false,
      time_sensitivity: 'normal',
    };
  }

  /**
   * Обновляет конфигурацию детектора
   */
  updateConfig(config: Partial<CriticalNewsConfig>): void {
    this.config = { ...this.config, ...config };
    this.logger.info('CriticalNewsDetector configuration updated', { config });
  }

  /**
   * Получает текущую конфигурацию
   */
  getConfig(): CriticalNewsConfig {
    return { ...this.config };
  }
}
