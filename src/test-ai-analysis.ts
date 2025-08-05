/**
 * Скрипт для тестирования ИИ анализа контента
 */

import dotenv from 'dotenv';
import { getAIAnalysisService } from './ai/AIAnalysisService';
import { newsScoreService } from './ai/NewsScoreService';
import { aiProcessorService } from './services/AIProcessorService';

// Загружаем переменные окружения
dotenv.config();

/**
 * Тестовые сообщения для анализа
 */
const testMessages = [
  {
    content: "Срочно! Президент подписал важный указ о новых санкциях. Это может серьезно повлиять на экономику страны.",
    channelName: "РБК Новости",
    mediaType: "text" as const
  },
  {
    content: "Сегодня хорошая погода 🌞",
    channelName: "Погода сегодня", 
    mediaType: "text" as const
  },
  {
    content: "Курс доллара вырос на 5 рублей. ЦБ РФ прокомментировал ситуацию на валютном рынке.",
    channelName: "Финансовые новости",
    mediaType: "text" as const
  },
  {
    content: "⚡ МОЛНИЯ: В центре Москвы произошел взрыв. Экстренные службы уже на месте.",
    channelName: "Экстренные новости",
    mediaType: "text" as const
  },
  {
    content: "Смотрите наши скидки! Покупайте товары со скидкой до 50%! Переходите по ссылке!",
    channelName: "Реклама",
    mediaType: "text" as const
  }
];

/**
 * Тестирование ИИ анализа
 */
async function testAIAnalysis(): Promise<void> {
  console.log('🤖 Начинаем тестирование ИИ анализа...\n');

  try {
    const aiService = getAIAnalysisService();
    console.log('✅ AI сервис инициализирован\n');

    for (let i = 0; i < testMessages.length; i++) {
      const message = testMessages[i];
      console.log(`📝 Тест ${i + 1}: Анализ сообщения`);
      console.log(`Канал: ${message.channelName}`);
      console.log(`Контент: "${message.content}"`);
      console.log('─'.repeat(50));

      try {
        // ИИ анализ
        const aiAnalysis = await aiService.analyzeContent(
          message.content,
          message.channelName,
          message.mediaType
        );

        console.log('🧠 Результат ИИ анализа:');
        console.log(`  Важность: ${aiAnalysis.importance.score}/100`);
        console.log(`  Категория: ${aiAnalysis.category.category} (${Math.round(aiAnalysis.category.confidence * 100)}%)`);
        console.log(`  Тональность: ${aiAnalysis.sentiment}`);
        console.log(`  Ключевые слова: ${aiAnalysis.keywords.join(', ')}`);
        console.log(`  Спам: ${aiAnalysis.isSpam ? 'Да' : 'Нет'}`);
        console.log(`  Реклама: ${aiAnalysis.isAd ? 'Да' : 'Нет'}`);
        
        if (aiAnalysis.summary) {
          console.log(`  Краткое содержание: ${aiAnalysis.summary}`);
        }

        // News scoring
        const newsScore = await newsScoreService.calculateScore(
          message.content,
          aiAnalysis,
          message.channelName,
          Math.floor(Math.random() * 100000), // случайное количество подписчиков
          Math.random() > 0.5, // случайная верификация
          message.mediaType
        );

        console.log('\n📊 Результат scoring:');
        console.log(`  Итоговый балл: ${newsScore.finalScore}/100`);
        console.log(`  Классификация: ${newsScore.classification}`);
        console.log('  Компоненты:');
        console.log(`    - Контент: ${newsScore.breakdown.contentScore}/100`);
        console.log(`    - ИИ анализ: ${newsScore.breakdown.aiScore}/100`);
        console.log(`    - Источник: ${newsScore.breakdown.sourceScore}/100`);
        console.log(`    - Актуальность: ${newsScore.breakdown.timelinesScore}/100`);
        
        console.log('  Обоснование:');
        newsScore.reasoning.forEach(reason => {
          console.log(`    • ${reason}`);
        });

      } catch (error) {
        console.error(`❌ Ошибка анализа: ${error}`);
      }

      console.log('\n' + '═'.repeat(60) + '\n');
    }

  } catch (error) {
    console.error(`❌ Критическая ошибка: ${error}`);
  }
}

/**
 * Тестирование AI Processor Service
 */
async function testAIProcessor(): Promise<void> {
  console.log('⚙️ Тестирование AI Processor Service...\n');

  try {
    // Проверяем состояние сервиса
    const isHealthy = aiProcessorService.isHealthy();
    console.log(`Состояние сервиса: ${isHealthy ? '✅ Здоров' : '❌ Неисправен'}`);

    // Получаем статистику
    const stats = await aiProcessorService.getProcessingStats();
    console.log('Статистика обработки:');
    console.log(`  Всего сообщений: ${stats.total}`);
    console.log(`  Обработано: ${stats.processed}`);
    console.log(`  Не обработано: ${stats.unprocessed}`);
    console.log(`  Средний балл важности: ${stats.avgImportanceScore}`);

    console.log('\n✅ AI Processor тест завершен\n');

  } catch (error) {
    console.error(`❌ Ошибка тестирования AI Processor: ${error}`);
  }
}

/**
 * Основная функция
 */
async function main(): Promise<void> {
  console.log('🚀 Запуск тестов ИИ анализа\n');

  // Проверяем наличие API ключа
  if (!process.env.OPENAI_API_KEY) {
    console.error('❌ OPENAI_API_KEY не найден в переменных окружения');
    console.log('Добавьте ключ в файл .env:');
    console.log('OPENAI_API_KEY=your_api_key_here');
    return;
  }

  await testAIAnalysis();
  await testAIProcessor();

  console.log('🎉 Все тесты завершены!');
}

// Запускаем только если файл вызван напрямую
if (require.main === module) {
  main().catch(console.error);
}