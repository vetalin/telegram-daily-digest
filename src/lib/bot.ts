import TelegramBot from 'node-telegram-bot-api'

let bot: TelegramBot | null = null

export function getBot(): TelegramBot {
  if (!bot) {
    const token = process.env.BOT_TOKEN
    if (!token) throw new Error('BOT_TOKEN is not set')

    if (process.env.NODE_ENV === 'production' && process.env.WEBHOOK_URL) {
      bot = new TelegramBot(token)
    } else {
      bot = new TelegramBot(token, { polling: false })
    }
  }
  return bot
}
