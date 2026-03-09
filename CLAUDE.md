# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Commands

```bash
# Development
npm run dev              # Run with tsx watch (hot reload)
npm run build            # Compile TypeScript to dist/
npm start                # Run compiled dist/index.js

# Testing
npm test                 # Run all tests
npm run test:watch       # Watch mode
npm run test:coverage    # With coverage report
npx jest tests/services/DigestService.test.ts  # Single test file

# Linting & Formatting
npm run lint             # ESLint check
npm run lint:fix         # ESLint auto-fix
npm run format           # Prettier format

# Database
npm run db:migrate       # Prisma migrate dev
npm run db:generate      # Prisma client generate
npm run db:studio        # Prisma Studio UI

# Userbot
npm run userbot:test     # Test Telegram userbot connection
npm run sessions:list    # List active sessions
npm run sessions:generate # Generate new session
npm run ai:test          # Test AI analysis

# Docker
docker-compose up        # Start app + userbot services
```

## Architecture

The application is split into two runtime processes managed by Docker Compose:

1. **Express API server** (`src/index.ts`) — REST API on port 3000, schedules daily digests via `node-cron`
2. **Telegram Userbot** (`src/userbot/TelegramUserbot.ts`) — monitors channels in real-time using the `telegram` (GramJS) library

### Message Processing Pipeline

Incoming messages from the userbot flow through `MessageProcessingPipeline`:

```
TelegramUserbot → ContentFilterService → AIProcessorService → NotificationService → NotificationSender → TelegramBot
```

- **ContentFilterService** — removes ads/spam using heuristic rules
- **AIProcessorService** — scores messages via `AIAnalysisService` (OpenAI GPT)
- **NotificationService** — decides which users receive notifications based on scores
- **NotificationSender** — delivers via `TelegramBotService` (node-telegram-bot-api)
- **DigestService** — cron job (08:00 daily) aggregating messages into digests

### Data Layer

PostgreSQL accessed via raw `pg` Pool (not Prisma ORM at runtime — Prisma is only for migrations). DAOs are in `src/database/dao/`, models in `src/database/models/`. All DAOs export singleton instances.

### Path Aliases

TypeScript paths configured in `tsconfig.json`:
- `@/` → `src/`
- `@/services/*`, `@/database/*`, `@/ai/*`, `@/bot/*`, `@/userbot/*`, `@/utils/*`

### Key Environment Variables

See `env.example`. Critical ones:
- `BOT_TOKEN` — Telegram bot token
- `API_ID`, `API_HASH`, `PHONE_NUMBER` — Userbot credentials
- `OPENAI_API_KEY` — for AI analysis (model: `gpt-3.5-turbo` by default)
- `DATABASE_URL` — PostgreSQL connection string
- `REDIS_URL` — Redis for Bull queues

### Logging

Use `createLogger(serviceName)` from `src/utils/logger.ts` (Winston-based) in all services — not `console.log`.

### Testing

Tests use `ts-jest`. Setup file: `tests/setup.ts`. Tests live in `tests/` (mirroring `src/` structure). The `tsconfig.json` excludes test files from compilation.
