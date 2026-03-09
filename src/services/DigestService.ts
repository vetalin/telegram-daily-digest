import { prisma } from '@/lib/prisma'
import { getBot } from '@/lib/bot'
import { createLogger } from '@/lib/logger'

const logger = createLogger('DigestService')
const MAX_MESSAGE_LENGTH = 4096

interface DigestMessage {
  rank: number
  category: string
  channelTitle: string
  summary: string
  score: number
  postedAt: Date
}

function formatDigestText(messages: DigestMessage[], periodStart: Date, periodEnd: Date): string {
  const dateStr = periodStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const lines: string[] = [
    `<b>📰 Дайджест за ${dateStr}</b>`,
    `<i>Топ ${messages.length} новостей из ваших каналов</i>`,
    '',
  ]

  for (const msg of messages) {
    const time = msg.postedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    lines.push(
      `<b>${msg.rank}. [${msg.category}]</b> — ${msg.channelTitle}`,
      msg.summary,
      `<i>⭐ ${msg.score.toFixed(1)} · ${time}</i>`,
      '',
    )
  }

  return lines.join('\n')
}

function splitText(text: string, maxLength: number): string[] {
  if (text.length <= maxLength) return [text]

  const parts: string[] = []
  let remaining = text

  while (remaining.length > maxLength) {
    let splitAt = remaining.lastIndexOf('\n\n', maxLength)
    if (splitAt === -1) splitAt = maxLength
    parts.push(remaining.slice(0, splitAt))
    remaining = remaining.slice(splitAt).trimStart()
  }

  if (remaining.length > 0) parts.push(remaining)
  return parts
}

export async function sendDigestForUser(userId: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userChannels: {
        include: { channel: true },
      },
    },
  })

  if (!user || !user.active) {
    logger.warn('User not found or inactive', { userId })
    return
  }

  const channelIds = user.userChannels.map((uc) => uc.channelId)
  if (channelIds.length === 0) {
    logger.info('User has no channels', { userId })
    return
  }

  const periodEnd = new Date()
  const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000)

  const rawMessages = await prisma.message.findMany({
    where: {
      channelId: { in: channelIds },
      postedAt: { gte: periodStart, lte: periodEnd },
      isFiltered: false,
      importanceScore: { not: null },
      isAd: false,
    },
    orderBy: { importanceScore: 'desc' },
    take: 30,
    include: { channel: true },
  })

  if (rawMessages.length === 0) {
    logger.info('No messages for digest', { userId })
    return
  }

  const digest = await prisma.digest.create({
    data: {
      userId,
      periodStart,
      periodEnd,
      status: 'PENDING',
    },
  })

  await prisma.digestMessage.createMany({
    data: rawMessages.map((msg, i) => ({
      digestId: digest.id,
      messageId: msg.id,
      rank: i + 1,
    })),
  })

  const messages: DigestMessage[] = rawMessages.map((msg, i) => ({
    rank: i + 1,
    category: msg.category ?? 'other',
    channelTitle: msg.channel.title,
    summary: msg.summary ?? msg.text.slice(0, 200),
    score: msg.importanceScore ?? 0,
    postedAt: msg.postedAt,
  }))

  const text = formatDigestText(messages, periodStart, periodEnd)
  const parts = splitText(text, MAX_MESSAGE_LENGTH)
  const bot = getBot()

  try {
    for (const part of parts) {
      await bot.sendMessage(user.telegramId.toString(), part, { parse_mode: 'HTML' })
    }

    await prisma.digest.update({
      where: { id: digest.id },
      data: { status: 'SENT', sentAt: new Date() },
    })

    logger.info('Digest sent', { userId, messagesCount: rawMessages.length })
  } catch (error) {
    await prisma.digest.update({
      where: { id: digest.id },
      data: { status: 'FAILED' },
    })
    logger.error('Failed to send digest', { userId, error })
    throw error
  }
}
