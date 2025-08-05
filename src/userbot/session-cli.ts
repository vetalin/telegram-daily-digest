#!/usr/bin/env node

/**
 * CLI утилита для управления сессиями Telegram Userbot
 */

import dotenv from 'dotenv';
import { SessionManager } from './SessionManager';
import { createLogger } from '../utils/logger';

// Загружаем переменные окружения
dotenv.config();

const logger = createLogger('SessionCLI');

async function listSessions() {
  try {
    const sessionManager = new SessionManager();
    const sessions = await sessionManager.listSessions();

    if (sessions.length === 0) {
      console.log('🔍 Сессии не найдены');
      return;
    }

    console.log(`📋 Найдено ${sessions.length} сессий:`);
    console.log('');

    sessions.forEach((session, index) => {
      console.log(`${index + 1}. ${session.sessionName}`);
      console.log(`   📱 Телефон: ${session.phoneNumber}`);
      if (session.username) console.log(`   👤 Username: @${session.username}`);
      if (session.firstName)
        console.log(
          `   👤 Имя: ${session.firstName} ${session.lastName || ''}`,
        );
      console.log(
        `   📅 Создана: ${session.createdAt.toLocaleString('ru-RU')}`,
      );
      console.log(
        `   🕒 Использована: ${session.lastUsed.toLocaleString('ru-RU')}`,
      );
      console.log(`   ✅ Активна: ${session.isActive ? 'Да' : 'Нет'}`);
      console.log('');
    });
  } catch (error) {
    logger.error('Ошибка получения списка сессий:', error);
    process.exit(1);
  }
}

async function deleteSession(sessionName: string) {
  try {
    const sessionManager = new SessionManager();

    // Проверяем существование сессии
    const exists = await sessionManager.sessionExists(sessionName);
    if (!exists) {
      console.log(`❌ Сессия "${sessionName}" не найдена`);
      return;
    }

    await sessionManager.deleteSession(sessionName);
    console.log(`✅ Сессия "${sessionName}" успешно удалена`);
  } catch (error) {
    logger.error('Ошибка удаления сессии:', error);
    process.exit(1);
  }
}

async function cleanupSessions(days: number) {
  try {
    const sessionManager = new SessionManager();
    const deleted = await sessionManager.cleanupOldSessions(days);

    if (deleted === 0) {
      console.log(`🧹 Старые сессии (старше ${days} дней) не найдены`);
    } else {
      console.log(`🧹 Удалено ${deleted} старых сессий (старше ${days} дней)`);
    }
  } catch (error) {
    logger.error('Ошибка очистки сессий:', error);
    process.exit(1);
  }
}

async function generateSessionName(phoneNumber: string) {
  try {
    const sessionManager = new SessionManager();
    const sessionName = sessionManager.generateSessionName(phoneNumber);
    console.log(
      `📝 Сгенерированное имя сессии для ${phoneNumber}: ${sessionName}`,
    );
  } catch (error) {
    logger.error('Ошибка генерации имени сессии:', error);
    process.exit(1);
  }
}

function showHelp() {
  console.log('CLI для управления сессиями Telegram Userbot');
  console.log('');
  console.log('Использование:');
  console.log('  npm run sessions:list                  - показать все сессии');
  console.log('  npm run sessions:delete <sessionName>  - удалить сессию');
  console.log(
    '  npm run sessions:cleanup [days]        - удалить старые сессии (по умолчанию 30 дней)',
  );
  console.log(
    '  npm run sessions:generate <phone>      - сгенерировать имя сессии',
  );
  console.log('');
}

async function main() {
  const args = process.argv.slice(2);
  const command = args[0];

  try {
    switch (command) {
      case 'list':
      case 'ls':
        await listSessions();
        break;

      case 'delete':
      case 'rm':
        if (!args[1]) {
          console.log('❌ Укажите имя сессии для удаления');
          process.exit(1);
        }
        await deleteSession(args[1]);
        break;

      case 'cleanup':
      case 'clean':
        const days = args[1] ? parseInt(args[1]) : 30;
        await cleanupSessions(days);
        break;

      case 'generate':
      case 'gen':
        if (!args[1]) {
          console.log('❌ Укажите номер телефона');
          process.exit(1);
        }
        await generateSessionName(args[1]);
        break;

      default:
        showHelp();
        break;
    }
  } catch (error) {
    logger.error('Ошибка выполнения команды:', error);
    process.exit(1);
  }
}

// Запускаем только если скрипт вызван напрямую
if (require.main === module) {
  main();
}
