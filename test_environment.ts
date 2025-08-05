/**
 * Тестовый скрипт для проверки настройки Node.js/TypeScript среды
 */

import * as os from 'os';

function testNodeJs(): void {
  console.log('=== Тестирование Node.js среды ===');
  console.log(`Node.js версия: ${process.version}`);
  console.log(`Платформа: ${os.platform()}`);
  console.log(`Архитектура: ${os.arch()}`);
}

function testTypeScript(): boolean {
  try {
    // Простая проверка TypeScript функциональности
    const message: string = 'TypeScript работает корректно!';
    const numbers: number[] = [1, 2, 3, 4, 5];
    const sum: number = numbers.reduce((acc, num) => acc + num, 0);

    console.log('\n=== Тестирование TypeScript ===');
    console.log(`✅ ${message}`);
    console.log(
      `✅ Типизация работает: сумма ${JSON.stringify(numbers)} = ${sum}`,
    );
    return true;
  } catch (error) {
    console.error(`❌ Ошибка в TypeScript: ${error}`);
    return false;
  }
}

function testTelegramLibrary(): boolean {
  try {
    // Проверяем импорт библиотеки telegram (GramJS)
    const { TelegramClient } = require('telegram');
    console.log('\n=== Тестирование библиотеки Telegram ===');
    console.log('✅ Библиотека telegram успешно импортирована');
    console.log(`✅ TelegramClient доступен: ${typeof TelegramClient === 'function'}`);
    return true;
  } catch (error) {
    console.error(`❌ Ошибка импорта библиотеки telegram: ${error}`);
    return false;
  }
}

function main(): void {
  testNodeJs();
  const tsResult = testTypeScript();
  const telegramResult = testTelegramLibrary();

  console.log('\n=== Результат ===');
  if (tsResult && telegramResult) {
    console.log('✅ Все тесты пройдены успешно!');
    process.exit(0);
  } else {
    console.log('❌ Некоторые тесты провалились');
    process.exit(1);
  }
}

// Запуск основной функции
main();
