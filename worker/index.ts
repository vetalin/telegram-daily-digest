import http from 'http'
import { PrismaClient } from '@prisma/client'
import { initUserbot, resolveChannel, loadMonitoredChannels, fetchChannelHistory } from './TelegramUserbot'
import { processPipelineMessage } from './MessagePipeline'
import { startDigestCron } from './DigestCron'
import { createLogger } from '../src/lib/logger'

const logger = createLogger('Worker')
const prisma = new PrismaClient()
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? ''
const PORT = parseInt(process.env.WORKER_PORT ?? '3001', 10)

async function loadAllChannels(): Promise<void> {
  const channels = await prisma.channel.findMany({
    select: { telegramChannelId: true },
  })

  const ids = channels.map((c) => {
    const raw = c.telegramChannelId.toString()
    return raw.startsWith('-100') ? raw.slice(4) : raw
  })

  await loadMonitoredChannels(ids)
}

function createHttpServer(): http.Server {
  return http.createServer(async (req, res) => {
    if (req.headers['x-internal-secret'] !== INTERNAL_SECRET) {
      res.writeHead(401)
      res.end('Unauthorized')
      return
    }

    if (req.method === 'POST' && req.url === '/internal/resolve-channel') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', async () => {
        try {
          const { identifier } = JSON.parse(body) as { identifier: string }
          const result = await resolveChannel(identifier)
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ id: result.id.toString(), title: result.title, username: result.username }))
        } catch (error) {
          logger.error('resolve-channel failed', { error })
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: (error as Error).message }))
        }
      })
      return
    }

    if (req.method === 'POST' && req.url === '/internal/backfill') {
      let body = ''
      req.on('data', (chunk) => (body += chunk))
      req.on('end', async () => {
        try {
          const { channelTelegramIds, sinceHours = 24 } = JSON.parse(body) as {
            channelTelegramIds: string[]
            sinceHours?: number
          }
          const sinceDate = new Date(Date.now() - sinceHours * 3600 * 1000)

          const allMessages = (
            await Promise.all(
              channelTelegramIds.map((id) =>
                fetchChannelHistory(BigInt(id), sinceDate).catch((e) => {
                  logger.warn('fetchChannelHistory failed', { id, error: e.message })
                  return []
                })
              )
            )
          ).flat()

          const channelBigInts = channelTelegramIds.map(BigInt)
          const channelRows = await prisma.channel.findMany({
            where: { telegramChannelId: { in: channelBigInts } },
            select: { id: true, telegramChannelId: true },
          })
          const channelIdMap = new Map(channelRows.map((c) => [c.telegramChannelId.toString(), c.id]))

          const telegramMsgIds = allMessages.map((m) => m.telegramMsgId)
          const scored = await prisma.message.findMany({
            where: {
              channelId: { in: channelRows.map((c) => c.id) },
              telegramMsgId: { in: telegramMsgIds },
              importanceScore: { not: null },
            },
            select: { channelId: true, telegramMsgId: true },
          })
          const scoredKeys = new Set(scored.map((m) => `${m.channelId}_${m.telegramMsgId}`))

          const toScore = allMessages.filter((m) => {
            const channelId = channelIdMap.get(m.channelTelegramId.toString())
            return channelId !== undefined && !scoredKeys.has(`${channelId}_${m.telegramMsgId}`)
          })

          const CONCURRENCY = 5
          let processed = 0, errors = 0
          for (let i = 0; i < toScore.length; i += CONCURRENCY) {
            const batch = toScore.slice(i, i + CONCURRENCY)
            const results = await Promise.allSettled(batch.map((msg) => processPipelineMessage(msg)))
            results.forEach((r) => {
              if (r.status === 'fulfilled') processed++
              else errors++
            })
          }

          const skipped = allMessages.length - toScore.length
          logger.info('Backfill completed', { total: allMessages.length, processed, skipped, errors })
          res.writeHead(200, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ processed, skipped, errors }))
        } catch (error) {
          logger.error('backfill failed', { error })
          res.writeHead(500, { 'Content-Type': 'application/json' })
          res.end(JSON.stringify({ error: (error as Error).message }))
        }
      })
      return
    }

    res.writeHead(404)
    res.end('Not found')
  })
}

async function main(): Promise<void> {
  logger.info('Starting worker process')

  // Проверяем критичные env переменные при старте
  const requiredEnv = ['GEMINI_API_KEY', 'BOT_TOKEN', 'INTERNAL_SECRET']
  for (const key of requiredEnv) {
    if (!process.env[key]) {
      logger.error(`Missing required env variable: ${key}`)
    } else {
      logger.info(`Env check OK: ${key} is set`)
    }
  }

  await prisma.$connect()
  logger.info('Database connected')

  await loadAllChannels()

  await initUserbot()

  startDigestCron()

  const server = createHttpServer()
  server.listen(PORT, () => {
    logger.info(`Worker HTTP server listening on :${PORT}`)
  })

  process.on('SIGTERM', async () => {
    logger.info('SIGTERM received, shutting down')
    await prisma.$disconnect()
    server.close()
    process.exit(0)
  })
}

main().catch((error) => {
  logger.error('Worker failed to start', { error })
  process.exit(1)
})
