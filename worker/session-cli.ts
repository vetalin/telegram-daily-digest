/**
 * Скрипт для генерации SESSION_STRING (запускать локально, один раз).
 *
 * Использование:
 *   API_ID=12345 API_HASH=your_hash npx tsx worker/session-cli.ts
 */

import { TelegramClient, sessions } from 'telegram'
import * as readline from 'readline'

const rl = readline.createInterface({ input: process.stdin, output: process.stdout })
const ask = (q: string): Promise<string> => new Promise((resolve) => rl.question(q, resolve))

const apiId = parseInt(process.env.API_ID ?? '')
const apiHash = process.env.API_HASH ?? ''

if (!apiId || !apiHash) {
  console.error('Ошибка: укажи API_ID и API_HASH в переменных окружения.')
  console.error('Пример: API_ID=12345 API_HASH=abcdef... npx tsx worker/session-cli.ts')
  process.exit(1)
}

const client = new TelegramClient(new sessions.StringSession(''), apiId, apiHash, {
  connectionRetries: 3,
})

;(async () => {
  await client.start({
    phoneNumber: async () => await ask('Номер телефона (например +79001234567): '),
    phoneCode: async () => {
      console.log('Код отправлен в Telegram-приложение (чат "Telegram" в списке чатов).')
      return await ask('Введи код: ')
    },
    password: async () => await ask('Пароль 2FA (Enter если нет): '),
    onError: (err) => console.error('Ошибка авторизации:', err.message),
  })

  const sessionString = client.session.save() as unknown as string
  console.log('\n✓ Успешно! Скопируй строку ниже в .env на сервере:\n')
  console.log(`SESSION_STRING=${sessionString}`)

  rl.close()
  await client.disconnect()
})()
