import { Logger } from '../utils/logger';

/**
 * Результат фильтрации контента
 */
export interface FilterResult {
  isFiltered: boolean; // true = контент должен быть отфильтрован (заблокирован)
  reasons: string[]; // Причины фильтрации
  confidence: number; // Уверенность в результате (0-1)
}

/**
 * Сервис для фильтрации нежелательного контента
 */
export class ContentFilterService {
  private logger: Logger;

  // Паттерны для обнаружения рекламы
  private readonly adPatterns = [
    // Прямая реклама
    /(?:купи|покупай|продаю|продается|заказ|скидка|акция|распродажа)/i,
    /(?:цена|стоимость|рубл|доллар|евро|₽|\$|€).*(?:\d+)/i,
    /(?:заказать|оформить|доставка|курьер)/i,

    // Финансовые схемы
    /(?:заработок|доход|инвестиц|крипто|биткоин|форекс|бинанс)/i,
    /(?:пассивный доход|легкие деньги|без вложений|гарантированный доход)/i,

    // Ставки и азартные игры
    /(?:ставки|казино|рулетка|слоты|бет|1xbet|fonbet)/i,
    /(?:выиграл|проиграл|коэффициент|букмекер)/i,

    // Подозрительные ссылки и каналы
    /(?:переходи|жми|кликай|подписыв|регистрир)/i,
    /(?:телеграм|telegram).*(?:канал|группа|бот)/i,

    // Медицинские товары и услуги
    /(?:похудение|диета|таблетки|препарат|лекарство)/i,
    /(?:потенция|эрекция|увеличение)/i,
  ];

  // Паттерны для обнаружения спама
  private readonly spamPatterns = [
    // Чрезмерное использование символов
    /(.)\1{4,}/g, // 4+ одинаковых символа подряд
    /[!]{3,}/g, // 3+ восклицательных знака
    /[?]{3,}/g, // 3+ вопросительных знака
    /[A-ZА-Я]{10,}/g, // 10+ заглавных букв подряд

    // Подозрительные призывы к действию
    /(?:срочно|немедленно|быстрее|скорее|жми|переходи)/i,
    /(?:только сегодня|ограниченное время|не упусти|последний шанс)/i,

    // Избыточное использование эмодзи
    /(?:[\u{1F600}-\u{1F64F}]|[\u{1F300}-\u{1F5FF}]|[\u{1F680}-\u{1F6FF}]|[\u{1F1E0}-\u{1F1FF}]){5,}/gu,
  ];

  // Ключевые слова низкокачественного контента
  private readonly lowQualityPatterns = [
    /^[\s\u{1F600}-\u{1F6FF}\u{2600}-\u{26FF}\u{2700}-\u{27BF}]*$/u, // Только эмодзи и пробелы
    /^[.]{3,}$/g, // Только точки
    /^[-_=+]{3,}$/g, // Только символы разделители
  ];

  constructor() {
    this.logger = new Logger('ContentFilterService');
  }

  /**
   * Основной метод фильтрации контента
   */
  async filterContent(
    content: string,
    mediaType?: string,
  ): Promise<FilterResult> {
    const reasons: string[] = [];
    let confidence = 0;

    // Пропускаем пустые сообщения
    if (!content || content.trim().length === 0) {
      if (!mediaType || mediaType === 'text') {
        return {
          isFiltered: true,
          reasons: ['Пустое сообщение'],
          confidence: 1.0,
        };
      }
      // Для медиа-контента пустой текст допустим
      return {
        isFiltered: false,
        reasons: [],
        confidence: 1.0,
      };
    }

    // Проверка на рекламу
    const adResult = this.checkForAds(content);
    if (adResult.detected) {
      reasons.push(...adResult.reasons);
      confidence = Math.max(confidence, adResult.confidence);
    }

    // Проверка на спам
    const spamResult = this.checkForSpam(content);
    if (spamResult.detected) {
      reasons.push(...spamResult.reasons);
      confidence = Math.max(confidence, spamResult.confidence);
    }

    // Проверка на низкокачественный контент
    const lowQualityResult = this.checkForLowQuality(content);
    if (lowQualityResult.detected) {
      reasons.push(...lowQualityResult.reasons);
      confidence = Math.max(confidence, lowQualityResult.confidence);
    }

    const isFiltered = reasons.length > 0 && confidence >= 0.7;

    if (isFiltered) {
      this.logger.debug('Контент отфильтрован', {
        content: content.substring(0, 100),
        reasons,
        confidence,
      });
    }

    return {
      isFiltered,
      reasons,
      confidence,
    };
  }

  /**
   * Проверка на рекламный контент
   */
  private checkForAds(content: string): {
    detected: boolean;
    reasons: string[];
    confidence: number;
  } {
    const reasons: string[] = [];
    let matches = 0;

    for (const pattern of this.adPatterns) {
      if (pattern.test(content)) {
        matches++;
        const patternName = this.getPatternName(pattern);
        reasons.push(`Реклама: ${patternName}`);
      }
    }

    const detected = matches > 0;
    const confidence = Math.min(matches * 0.3, 1.0); // Каждое совпадение добавляет 30% уверенности

    return { detected, reasons, confidence };
  }

  /**
   * Проверка на спам
   */
  private checkForSpam(content: string): {
    detected: boolean;
    reasons: string[];
    confidence: number;
  } {
    const reasons: string[] = [];
    let spamScore = 0;

    // Проверяем спам-паттерны
    for (const pattern of this.spamPatterns) {
      const matches = content.match(pattern);
      if (matches && matches.length > 0) {
        spamScore += matches.length * 0.2;
        reasons.push(`Спам: подозрительные паттерны`);
      }
    }

    // Проверяем соотношение заглавных букв
    const upperCaseRatio =
      (content.match(/[A-ZА-Я]/g) || []).length / content.length;
    if (upperCaseRatio > 0.5 && content.length > 20) {
      spamScore += 0.4;
      reasons.push('Спам: чрезмерное использование заглавных букв');
    }

    // Проверяем повторяющиеся слова
    const words = content.toLowerCase().split(/\s+/);
    const wordCount = new Map<string, number>();
    words.forEach((word) => {
      if (word.length > 2) {
        wordCount.set(word, (wordCount.get(word) || 0) + 1);
      }
    });

    const maxWordCount = Math.max(...Array.from(wordCount.values()));
    if (maxWordCount > Math.max(words.length * 0.3, 3)) {
      spamScore += 0.3;
      reasons.push('Спам: чрезмерное повторение слов');
    }

    const detected = spamScore > 0;
    const confidence = Math.min(spamScore, 1.0);

    return { detected, reasons, confidence };
  }

  /**
   * Проверка на низкокачественный контент
   */
  private checkForLowQuality(content: string): {
    detected: boolean;
    reasons: string[];
    confidence: number;
  } {
    const reasons: string[] = [];
    let detected = false;
    let confidence = 0;

    // Слишком короткий контент (меньше 3 символов)
    if (content.trim().length < 3) {
      detected = true;
      confidence = 0.8;
      reasons.push('Низкое качество: слишком короткое сообщение');
    }

    // Проверяем паттерны низкокачественного контента
    for (const pattern of this.lowQualityPatterns) {
      if (pattern.test(content)) {
        detected = true;
        confidence = Math.max(confidence, 0.9);
        reasons.push('Низкое качество: только символы/эмодзи');
        break;
      }
    }

    return { detected, reasons, confidence };
  }

  /**
   * Получить читаемое имя паттерна для логирования
   */
  private getPatternName(pattern: RegExp): string {
    const patternStr = pattern.toString();
    if (patternStr.includes('купи|покупай|продаю')) return 'торговые призывы';
    if (patternStr.includes('цена|стоимость')) return 'финансовые термины';
    if (patternStr.includes('заработок|доход')) return 'финансовые схемы';
    if (patternStr.includes('ставки|казино')) return 'азартные игры';
    if (patternStr.includes('переходи|жми')) return 'призывы к действию';
    if (patternStr.includes('похудение|диета')) return 'медицинские товары';
    return 'подозрительный контент';
  }

  /**
   * Получить статистику фильтрации (для отладки и мониторинга)
   */
  getFilterStats(): { totalPatterns: number; categories: string[] } {
    return {
      totalPatterns:
        this.adPatterns.length +
        this.spamPatterns.length +
        this.lowQualityPatterns.length,
      categories: ['реклама', 'спам', 'низкое качество'],
    };
  }
}

// Экспортируем единственный экземпляр сервиса
export const contentFilterService = new ContentFilterService();
