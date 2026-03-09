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
  const channel = await prisma.channel.findUnique({
    where: { telegramChannelId: raw.channelTelegramId },
  })

  if (!channel) {
    logger.warn('Channel not found in DB', { channelTelegramId: raw.channelTelegramId.toString() })
    return
  }

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
    logger.debug('Message filtered', { reason: filterResult.reason, msgId: raw.telegramMsgId })
    return
  }

  let scoreResult
  try {
    scoreResult = await scoreMessage(raw.text)
  } catch (error) {
    logger.error('Scoring failed, saving unscored', { error })
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

  logger.info('Message processed', {
    channelId: channel.id,
    msgId: raw.telegramMsgId,
    score: scoreResult.importance,
    category: scoreResult.category,
  })
}
