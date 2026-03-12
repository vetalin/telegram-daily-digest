import { NextRequest, NextResponse } from 'next/server'
import { getBot } from '@/lib/bot'
import { prisma } from '@/lib/prisma'
import { createLogger } from '@/lib/logger'
import { textToAudio } from '@/services/AudioService'

const logger = createLogger('BotWebhook')

export async function POST(req: NextRequest) {
  try {
    const update = await req.json()
    const bot = getBot()

    if (update.message) {
      const msg = update.message
      const chatId = msg.chat.id
      const text = msg.text ?? ''
      const userId = msg.from?.id

      if (text === '/start' || text.startsWith('/start ')) {
        await bot.sendMessage(chatId, '👋 <b>Добро пожаловать в Telegram Daily Digest!</b>\n\nЯ собираю новости из выбранных каналов и отправляю вам ежедневный дайджест.\n\nОткройте Mini App для настройки:', {
          parse_mode: 'HTML',
          reply_markup: {
            inline_keyboard: [[
              {
                text: '📱 Открыть приложение',
                web_app: { url: `${process.env.NEXT_PUBLIC_APP_URL}/mini-app` },
              },
            ]],
          },
        })

        if (userId) {
          await prisma.user.upsert({
            where: { telegramId: BigInt(userId) },
            update: { username: msg.from?.username, firstName: msg.from?.first_name },
            create: {
              telegramId: BigInt(userId),
              username: msg.from?.username,
              firstName: msg.from?.first_name,
            },
          })
        }
      } else if (text === '/help') {
        await bot.sendMessage(chatId, '📖 <b>Как пользоваться:</b>\n\n1. Откройте Mini App\n2. Добавьте каналы для мониторинга\n3. Настройте время дайджеста\n4. Получайте ежедневные сводки!\n\n/start — главное меню', {
          parse_mode: 'HTML',
        })
      }
    }

    if (update.callback_query) {
      const query = update.callback_query
      const chatId = query.message?.chat?.id
      const data: string = query.data ?? ''

      await bot.answerCallbackQuery(query.id)

      if (data.startsWith('audio:') && chatId) {
        const digestId = parseInt(data.slice('audio:'.length), 10)
        if (isNaN(digestId)) return NextResponse.json({ ok: true })

        const digest = await prisma.digest.findUnique({ where: { id: digestId } })
        if (!digest?.analyticsText) {
          await bot.sendMessage(chatId, '❌ Текст аналитики не найден.')
          return NextResponse.json({ ok: true })
        }

        const processingMsg = await bot.sendMessage(chatId, '🎙 Генерирую аудио, подождите...')

        try {
          const audioBuffer = await textToAudio(digest.analyticsText)
          await bot.sendAudio(
            chatId,
            audioBuffer,
            { title: digest.groupName ? `Аналитика: ${digest.groupName}` : 'Аналитика дня' },
            { filename: 'analytics.mp3', contentType: 'audio/mpeg' },
          )
        } catch (err) {
          logger.error('Failed to generate audio', { digestId, error: err })
          await bot.sendMessage(chatId, '❌ Не удалось сгенерировать аудио. Попробуйте позже.')
        } finally {
          await bot.deleteMessage(chatId, processingMsg.message_id).catch(() => {})
        }
      }
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error('Webhook error', { error })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
