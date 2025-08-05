/**
 * Скрипт для тестирования системы фильтрации контента
 */

import { contentFilterService } from './services/ContentFilterService';
import { filterProcessorService } from './services/FilterProcessorService';
import { messageDAO } from './database/dao';
import { createLogger } from './utils/logger';

const logger = createLogger('ContentFilterTest');

// Тестовые сообщения для проверки фильтрации
const testMessages = [
  // Реклама
  'Купи сейчас со скидкой 50%! Цена всего 1000 рублей!',
  'Заработок от 50000 рублей в месяц без вложений!',
  'Переходи в наш телеграм канал для заказа',
  'Ставки на спорт с высокими коэффициентами в 1xbet',

  // Спам
  'СРОЧНО!!! БЫСТРЕЕ!!! НЕ УПУСТИ ШАНС!!!',
  'Жми жми жми жми кликай кликай кликай',
  '🔥🔥🔥🔥🔥🔥🔥🔥🔥🔥 ГОРЯЧЕЕ ПРЕДЛОЖЕНИЕ',
  'купи купи купи купи купи сейчас сейчас сейчас',

  // Низкое качество
  '😀😀😀😀😀',
  '...',
  'а',
  '____________________',

  // Нормальные сообщения
  'Привет! Как дела?',
  'Интересная статья о технологиях',
  'Сегодня хорошая погода для прогулки',
  'Посмотрел новый фильм, рекомендую',
  'Завтра встреча в 15:00',

  // Граничные случаи
  'Продаю старый велосипед, цена договорная', // Может быть заблокировано как реклама
  'Заработал сегодня на работе неплохо', // Не должно блокироваться
  'Классный канал в телеграме про науку', // Не должно блокироваться
];

/**
 * Тестирует фильтрацию отдельных сообщений
 */
async function testContentFiltering() {
  logger.info('=== Тестирование фильтрации контента ===');

  let totalTested = 0;
  let totalBlocked = 0;
  let totalAllowed = 0;

  for (const content of testMessages) {
    try {
      const result = await contentFilterService.filterContent(content, 'text');

      totalTested++;
      if (result.isFiltered) {
        totalBlocked++;
        logger.warn('🚫 ЗАБЛОКИРОВАНО', {
          content:
            content.substring(0, 50) + (content.length > 50 ? '...' : ''),
          reasons: result.reasons,
          confidence: result.confidence,
        });
      } else {
        totalAllowed++;
        logger.info('✅ РАЗРЕШЕНО', {
          content:
            content.substring(0, 50) + (content.length > 50 ? '...' : ''),
          confidence: result.confidence,
        });
      }
    } catch (error) {
      logger.error('Ошибка тестирования:', error);
    }
  }

  logger.info('=== Результаты тестирования ===', {
    totalTested,
    totalBlocked,
    totalAllowed,
    blockRate: ((totalBlocked / totalTested) * 100).toFixed(1) + '%',
  });
}

/**
 * Тестирует статистику фильтрации
 */
async function testFilterStatistics() {
  logger.info('=== Тестирование статистики ===');

  try {
    const stats = await filterProcessorService.getFilterStatistics();

    if (stats) {
      logger.info('Текущая статистика фильтрации:', {
        total: stats.total,
        filtered: stats.filtered,
        unfiltered: stats.unfiltered,
        filterRate: stats.filterRate + '%',
      });
    } else {
      logger.warn('Не удалось получить статистику');
    }
  } catch (error) {
    logger.error('Ошибка получения статистики:', error);
  }
}

/**
 * Тестирует получение информации о фильтре
 */
function testFilterInfo() {
  logger.info('=== Информация о фильтре ===');

  const filterStats = contentFilterService.getFilterStats();
  logger.info('Статистика фильтра:', filterStats);
}

/**
 * Основная функция тестирования
 */
async function runTests() {
  try {
    logger.info('Запуск тестов системы фильтрации контента...');

    // Тест 1: Информация о фильтре
    testFilterInfo();

    // Тест 2: Фильтрация тестовых сообщений
    await testContentFiltering();

    // Тест 3: Статистика из базы данных
    await testFilterStatistics();

    logger.info('Все тесты завершены успешно!');
  } catch (error) {
    logger.error('Ошибка при выполнении тестов:', error);
  }
}

// Запускаем тесты если файл выполняется напрямую
if (require.main === module) {
  runTests()
    .then(() => {
      process.exit(0);
    })
    .catch((error) => {
      logger.error('Критическая ошибка:', error);
      process.exit(1);
    });
}

export { runTests };
