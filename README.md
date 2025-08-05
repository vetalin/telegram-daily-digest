# Telegram Daily Digest Bot

Интеллектуальный телеграм бот для агрегации и анализа контента из телеграм каналов. Бот собирает информацию из указанных каналов, фильтрует качественный контент, создает ежедневные дайджесты и отправляет немедленные уведомления о важных новостях.

## 🎯 Основные возможности

- **Мониторинг каналов** - отслеживание указанных пользователем телеграм каналов в режиме реального времени
- **Фильтрация контента** - удаление рекламы, спама и некачественного контента
- **AI-анализ** - определение важности новостей и соответствия интересам пользователя
- **Ежедневные дайджесты** - структурированные саммари за день
- **Немедленные уведомления** - мгновенные push-уведомления для критически важных новостей
- **Персонализация** - настройка интересов и критериев важности для каждого пользователя

## 🛠 Технологический стек

- **Backend**: TypeScript/Node.js
- **Userbot**: Telethon (через Python integration)
- **Database**: PostgreSQL, Redis
- **AI/ML**: OpenAI API
- **Queue System**: Bull/Redis
- **Deployment**: Docker

## 📋 Требования

- Node.js 18+
- Python 3.9+
- PostgreSQL 14+
- Redis 6+
- Docker (для деплоя)

## 🚀 Быстрый старт

### Клонирование репозитория

```bash
git clone https://github.com/username/telegram-daily-digest.git
cd telegram-daily-digest
```

### Установка зависимостей

```bash
# Установка Node.js зависимостей
npm install

# Установка Python зависимостей для Telethon
pip install -r requirements.txt
```

### Настройка окружения

1. Скопируйте файл с примером переменных окружения:

```bash
cp .env.example .env
```

2. Заполните необходимые API ключи в `.env`:

- Telegram API credentials (api_id, api_hash)
- OpenAI API key
- Database connection strings

### Запуск разработческого сервера

```bash
npm run dev
```

## 📁 Структура проекта

```
telegram-daily-digest/
├── src/
│   ├── bot/           # Telegram bot logic
│   ├── userbot/       # Telethon userbot integration
│   ├── services/      # Business logic services
│   ├── database/      # Database models and migrations
│   ├── ai/            # AI analysis modules
│   └── utils/         # Utility functions
├── docker/            # Docker configuration
├── docs/              # Documentation
└── tests/             # Test files
```

## 🔧 Разработка

### Скрипты

- `npm run dev` - запуск в режиме разработки
- `npm run build` - сборка проекта
- `npm run test` - запуск тестов
- `npm run lint` - проверка кода
- `npm run docker:build` - сборка Docker образа

### Конфигурация

Проект использует:

- TypeScript для типизации
- ESLint для линтинга
- Prettier для форматирования
- Jest для тестирования

## 📖 Документация

Подробная документация доступна в папке `docs/`:

- [API Documentation](docs/api.md)
- [Database Schema](docs/database.md)
- [Deployment Guide](docs/deployment.md)

## 🤝 Участие в разработке

1. Форкните репозиторий
2. Создайте feature ветку (`git checkout -b feature/amazing-feature`)
3. Сделайте коммит изменений (`git commit -m 'Add amazing feature'`)
4. Отправьте в ветку (`git push origin feature/amazing-feature`)
5. Откройте Pull Request

## 📄 Лицензия

Этот проект лицензирован под MIT License - смотрите файл [LICENSE](LICENSE) для деталей.

## 📞 Поддержка

Если у вас есть вопросы или предложения, создайте [issue](https://github.com/username/telegram-daily-digest/issues) в репозитории.
