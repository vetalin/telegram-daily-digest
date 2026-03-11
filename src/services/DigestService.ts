import { prisma } from '@/lib/prisma'
import { getBot } from '@/lib/bot'
import { createLogger } from '@/lib/logger'
import { generateDigestSummary } from '@/services/GeminiScorer'

const logger = createLogger('DigestService')
const MAX_MESSAGE_LENGTH = 4096

interface DigestMessage {
  rank: number
  category: string
  channelTitle: string
  summary: string
  score: number
  postedAt: Date
  messageLink: string
}

function buildMessageLink(channel: { username: string | null; telegramChannelId: bigint }, telegramMsgId: number): string {
  if (channel.username) {
    return `https://t.me/${channel.username}/${telegramMsgId}`
  }
  // Private channel: strip -100 prefix from channel ID
  const numericId = channel.telegramChannelId.toString().replace(/^-100/, '')
  return `https://t.me/c/${numericId}/${telegramMsgId}`
}

function formatDigestText(messages: DigestMessage[], periodStart: Date, groupName?: string): string {
  const dateStr = periodStart.toLocaleDateString('ru-RU', { day: 'numeric', month: 'long' })
  const heading = groupName
    ? `<b>📂 ${groupName} — Дайджест за ${dateStr}</b>`
    : `<b>📰 Дайджест за ${dateStr}</b>`

  const lines: string[] = [
    heading,
    `<i>Топ ${messages.length} новостей${groupName ? ` из группы «${groupName}»` : ' из ваших каналов'}</i>`,
    '',
  ]

  for (const msg of messages) {
    const time = msg.postedAt.toLocaleTimeString('ru-RU', { hour: '2-digit', minute: '2-digit' })
    lines.push(
      `<b>${msg.rank}. [${msg.category}]</b> — ${msg.channelTitle}`,
      msg.summary,
      `<i>⭐ ${msg.score.toFixed(1)} · ${time}</i> · <a href="${msg.messageLink}">оригинал</a>`,
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

async function sendDigestGroup(
  userId: number,
  telegramId: string,
  channelIds: number[],
  periodStart: Date,
  periodEnd: Date,
  groupId?: number,
  groupName?: string,
  aiPrompt?: string,
): Promise<void> {
  const bot = getBot()

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
    logger.info('No messages for digest group', { userId, groupName })
    return
  }

  const digest = await prisma.digest.create({
    data: {
      userId,
      periodStart,
      periodEnd,
      status: 'PENDING',
      groupId: groupId ?? null,
      groupName: groupName ?? null,
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
    messageLink: buildMessageLink(msg.channel, msg.telegramMsgId),
  }))

  const text = formatDigestText(messages, periodStart, groupName)
  const parts = splitText(text, MAX_MESSAGE_LENGTH)

  let summaryText: string | null = null
  try {
    summaryText = await generateDigestSummary(messages, aiPrompt)
  } catch (err) {
    logger.warn('Failed to generate digest summary, skipping', { userId, groupName, error: err })
  }

  try {
    for (const part of parts) {
      await bot.sendMessage(telegramId, part, { parse_mode: 'HTML' })
    }

    if (summaryText) {
      const label = groupName ? `🧠 Аналитика: ${groupName}` : '🧠 Аналитика дня'
      const summaryMessage = `<b>${label}</b>\n\n${summaryText}`
      const summaryParts = splitText(summaryMessage, MAX_MESSAGE_LENGTH)
      for (const part of summaryParts) {
        await bot.sendMessage(telegramId, part, { parse_mode: 'HTML' })
      }
    }

    await prisma.digest.update({
      where: { id: digest.id },
      data: { status: 'SENT', sentAt: new Date() },
    })

    logger.info('Digest group sent', { userId, groupName, messagesCount: rawMessages.length })
  } catch (error) {
    await prisma.digest.update({
      where: { id: digest.id },
      data: { status: 'FAILED' },
    })
    logger.error('Failed to send digest group', { userId, groupName, error })
    throw error
  }
}

export async function sendDigestForUser(userId: number): Promise<void> {
  const user = await prisma.user.findUnique({
    where: { id: userId },
    include: {
      userChannels: {
        include: { channel: true, group: true },
      },
      channelGroups: true,
    },
  })

  if (!user || !user.active) {
    logger.warn('User not found or inactive', { userId })
    throw new Error('Пользователь не найден или неактивен')
  }

  if (user.userChannels.length === 0) {
    logger.info('User has no channels', { userId })
    throw new Error('У вас нет подключённых каналов')
  }

  const periodEnd = new Date()
  const periodStart = new Date(periodEnd.getTime() - 24 * 60 * 60 * 1000)
  const telegramId = user.telegramId.toString()

  // Split channels into groups and ungrouped
  const groupedChannelIds = new Map<number, number[]>()
  const ungroupedChannelIds: number[] = []

  for (const uc of user.userChannels) {
    if (uc.groupId !== null) {
      const list = groupedChannelIds.get(uc.groupId) ?? []
      list.push(uc.channelId)
      groupedChannelIds.set(uc.groupId, list)
    } else {
      ungroupedChannelIds.push(uc.channelId)
    }
  }

  let anySent = false

  // Send a digest for each group
  for (const group of user.channelGroups) {
    const channelIds = groupedChannelIds.get(group.id)
    if (!channelIds || channelIds.length === 0) continue

    await sendDigestGroup(
      userId,
      telegramId,
      channelIds,
      periodStart,
      periodEnd,
      group.id,
      group.name,
      group.aiPrompt ?? undefined,
    )
    anySent = true
  }

  // Send digest for ungrouped channels
  if (ungroupedChannelIds.length > 0) {
    await sendDigestGroup(userId, telegramId, ungroupedChannelIds, periodStart, periodEnd)
    anySent = true
  }

  if (!anySent) {
    throw new Error('За последние 24 часа нет оценённых сообщений для дайджеста')
  }
}
