# Развёртывание Telegram Daily Digest на VPS

## Предварительные требования

- VPS с Ubuntu 22.04+ (минимум 2GB RAM)
- Домен, указывающий на IP сервера (для HTTPS и Telegram webhook)
- Telegram бот (от @BotFather)
- Telegram API credentials (от my.telegram.org)
- Google Gemini API key

---

## Шаг 1 — Подготовка сервера

```bash
# Подключаемся к VPS
ssh root@YOUR_SERVER_IP

# Обновляем систему
apt update && apt upgrade -y

# Устанавливаем Docker и Docker Compose
curl -fsSL https://get.docker.com | sh
apt install -y docker-compose-plugin

# Проверяем
docker --version
docker compose version
```

---

## Шаг 2 — Установка Nginx + SSL

```bash
apt install -y nginx certbot python3-certbot-nginx

# Создаём конфиг Nginx
cat > /etc/nginx/sites-available/digest << 'EOF'
server {
    listen 80;
    server_name telegram-daily-digest.ru;

    location / {
        proxy_pass http://localhost:3000;
        proxy_http_version 1.1;
        proxy_set_header Upgrade $http_upgrade;
        proxy_set_header Connection 'upgrade';
        proxy_set_header Host $host;
        proxy_set_header X-Real-IP $remote_addr;
        proxy_cache_bypass $http_upgrade;
    }
}
EOF

ln -s /etc/nginx/sites-available/digest /etc/nginx/sites-enabled/
nginx -t && systemctl reload nginx

# Получаем SSL сертификат
certbot --nginx -d telegram-daily-digest.ru
```

---

## Шаг 3 — Клонируем проект

```bash
mkdir -p /opt/digest && cd /opt/digest

# Если репозиторий на GitHub:
git clone https://github.com/YOUR_USERNAME/telegram-daily-digest.git .

# Или загружаем файлы через rsync с локальной машины (выполнять ЛОКАЛЬНО):
rsync -avz --exclude 'node_modules' --exclude '.next' \
  /Users/vitalijudin/dragon-tech/telegram-daily-digest/ \
  root@YOUR_SERVER_IP:/opt/digest/
```

---

## Шаг 4 — Получаем GramJS SESSION_STRING

Это нужно сделать **один раз локально** — вводить телефон и код интерактивно нельзя на сервере.

```bash
# На локальной машине, в папке проекта:
cd /Users/vitalijudin/dragon-tech/telegram-daily-digest
npm install
API_ID=12345 API_HASH=your_hash PHONE_NUMBER=+7... npx tsx src/userbot/session-cli.ts
```

Скопируй выведенную строку `SESSION_STRING` — она понадобится в `.env`.

Если `session-cli.ts` не существует, создай временный скрипт:

```bash
cat > /tmp/gen-session.ts << 'EOF'
import { TelegramClient, sessions } from 'telegram'
import * as readline from 'readline'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q: string) => new Promise<string>(r => rl.question(q, r))

const client = new TelegramClient(
  new sessions.StringSession(''),
  parseInt(process.env.API_ID!),
  process.env.API_HASH!,
  { connectionRetries: 3 }
)

await client.start({
  phoneNumber: async () => await ask('Phone: '),
  phoneCode: async () => await ask('Code: '),
  password: async () => await ask('2FA password (Enter to skip): '),
  onError: console.error,
})

console.log('\nSESSION_STRING=' + client.session.save())
rl.close()
await client.disconnect()
EOF

npx tsx /tmp/gen-session.ts
```

---

## Шаг 5 — Настраиваем .env на сервере

```bash
cd /opt/digest
cp .env.example .env
nano .env
```

Заполняем все переменные:

```env
DATABASE_URL="postgresql://postgres:STRONG_PASSWORD@postgres:5432/telegram_digest"
BOT_TOKEN="1234567890:AABBCCDDEEFFaabbccddeeff"
WEBHOOK_URL="https://YOUR_DOMAIN.COM"
API_ID=12345
API_HASH="abcdef1234567890abcdef1234567890"
PHONE_NUMBER="+79001234567"
SESSION_STRING="PASTE_SESSION_STRING_HERE"
GEMINI_API_KEY="AIzaSy..."
INTERNAL_SECRET="PASTE_GENERATED_SECRET_HERE"
NEXT_PUBLIC_APP_URL="https://YOUR_DOMAIN.COM"
NODE_ENV="production"
WORKER_PORT=3001
NEXTJS_URL="http://nextjs:3000"
WORKER_URL="http://worker:3001"
LOG_LEVEL="info"
```

Сгенерировать `INTERNAL_SECRET`:

```bash
openssl rand -hex 32
```

---

## Шаг 6 — Обновляем пароль PostgreSQL в docker-compose.yml

В `docker-compose.yml` замени `password` на тот же `STRONG_PASSWORD` что в `.env`:

```bash
nano docker-compose.yml
# Найти POSTGRES_PASSWORD: password и заменить на свой пароль
# Найти postgresql://postgres:password@ и заменить тоже
```

---

## Шаг 7 — Добавляем output: standalone в next.config.ts

```bash
cat > /opt/digest/next.config.ts << 'EOF'
import type { NextConfig } from 'next'

const nextConfig: NextConfig = {
  output: 'standalone',
  experimental: {
    serverComponentsExternalPackages: ['winston', 'telegram'],
  },
}

export default nextConfig
EOF
```

---

## Шаг 8 — Запускаем приложение

```bash
cd /opt/digest

# Собираем образы
docker compose build

# Запускаем PostgreSQL
docker compose up -d postgres

# Ждём и накатываем миграции
sleep 5
docker compose run --rm nextjs npx prisma migrate deploy

# Запускаем всё
docker compose up -d

# Смотрим логи
docker compose logs -f
```

---

## Шаг 9 — Регистрируем Telegram Webhook

```bash
# Устанавливаем webhook
curl -X POST "https://api.telegram.org/bot<BOT_TOKEN>/setWebhook" \
  -H "Content-Type: application/json" \
  -d '{"url": "https://YOUR_DOMAIN.COM/api/bot/webhook"}'

# Проверяем статус
curl "https://api.telegram.org/bot<BOT_TOKEN>/getWebhookInfo"
```

---

## Шаг 10 — Настраиваем Mini App в боте

1. Открой @BotFather в Telegram
2. Команда `/newapp` → выбери своего бота
3. Укажи URL: `https://YOUR_DOMAIN.COM/mini-app`
4. Или добавь кнопку меню: `/setmenubutton` → URL: `https://YOUR_DOMAIN.COM/mini-app`

---

## Проверка

```bash
# Статус контейнеров
docker compose ps

# Логи NextJS
docker compose logs nextjs --tail=50

# Логи Worker (GramJS)
docker compose logs worker --tail=50

# Тест API
curl https://YOUR_DOMAIN.COM/api/bot/webhook

# Написать /start боту в Telegram — должна появиться кнопка "Открыть приложение"
```

---

## Обновление после изменений кода

```bash
cd /opt/digest
git pull  # или rsync снова
docker compose build
docker compose up -d
```

---

## Частые проблемы

| Проблема | Решение |
|----------|---------|
| Worker не подключается к Telegram | Проверь `SESSION_STRING` — он должен быть валидным |
| Webhook не работает | Убедись что HTTPS настроен, проверь `getWebhookInfo` |
| Миграции падают | `docker compose run --rm nextjs npx prisma migrate deploy` |
| Mini App не открывается | URL должен быть HTTPS, проверь `NEXT_PUBLIC_APP_URL` |
| Нет дайджестов | Проверь `digestTime` в UTC, логи worker покажут срабатывание cron |
| Порт 3000 занят | Nginx проксирует снаружи, контейнер слушает внутри — всё нормально |
