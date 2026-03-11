import { PrismaClient } from '@prisma/client'
import { filterMessage } from '../src/services/ContentFilter'
import { scoreMessage } from '../src/services/GeminiScorer'
import { createLogger } from '../src/lib/logger'

const logger = createLogger('MessagePipeline')
const prisma = new PrismaClient()

export interface RawMessage {
  channelTelegramId: bigint
  telegramMsgId: number
  text: string
  postedAt: Date
  mediaType?: string
}

export async function processPipelineMessage(raw: RawMessage): Promise<void> {
  const textPreview = raw.text.slice(0, 60).replace(/\n/g, ' ')
  logger.info('Processing message', { channelTelegramId: raw.channelTelegramId.toString(), msgId: raw.telegramMsgId, textPreview })

  const channel = await prisma.channel.findUnique({
    where: { telegramChannelId: raw.channelTelegramId },
  })

  if (!channel) {
    logger.warn('Channel not found in DB — message dropped', { channelTelegramId: raw.channelTelegramId.toString() })
    return
  }

  logger.debug('Channel found', { channelId: channel.id, channelTitle: channel.title })

  const filterResult = filterMessage(raw.text)

  if (filterResult.filtered) {
    await prisma.message.upsert({
      where: {
        channelId_telegramMsgId: {
          channelId: channel.id,
          telegramMsgId: raw.telegramMsgId,
        },
      },
      create: {
        channelId: channel.id,
        telegramMsgId: raw.telegramMsgId,
        text: raw.text,
        mediaType: raw.mediaType,
        postedAt: raw.postedAt,
        isFiltered: true,
      },
      update: {},
    })
    logger.info('Message filtered (skipped)', { reason: filterResult.reason, msgId: raw.telegramMsgId, channel: channel.title })
    return
  }

  logger.info('Message passed filter, sending to Gemini', { msgId: raw.telegramMsgId, channel: channel.title })

  let scoreResult
  try {
    scoreResult = await scoreMessage(raw.text)
  } catch (error) {
    logger.error('Gemini scoring failed, saving unscored', { error, msgId: raw.telegramMsgId, channel: channel.title })
    await prisma.message.upsert({
      where: {
        channelId_telegramMsgId: {
          channelId: channel.id,
          telegramMsgId: raw.telegramMsgId,
        },
      },
      create: {
        channelId: channel.id,
        telegramMsgId: raw.telegramMsgId,
        text: raw.text,
        mediaType: raw.mediaType,
        postedAt: raw.postedAt,
        isFiltered: false,
      },
      update: {},
    })
    return
  }

  await prisma.message.upsert({
    where: {
      channelId_telegramMsgId: {
        channelId: channel.id,
        telegramMsgId: raw.telegramMsgId,
      },
    },
    create: {
      channelId: channel.id,
      telegramMsgId: raw.telegramMsgId,
      text: raw.text,
      mediaType: raw.mediaType,
      postedAt: raw.postedAt,
      isFiltered: false,
      isAd: scoreResult.isAd,
      importanceScore: scoreResult.importance,
      category: scoreResult.category,
      summary: scoreResult.summary,
      scoredAt: new Date(),
    },
    update: {
      isAd: scoreResult.isAd,
      importanceScore: scoreResult.importance,
      category: scoreResult.category,
      summary: scoreResult.summary,
      scoredAt: new Date(),
    },
  })

  logger.info('Message processed and saved', {
    channel: channel.title,
    msgId: raw.telegramMsgId,
    score: scoreResult.importance,
    category: scoreResult.category,
    isAd: scoreResult.isAd,
  })
}
