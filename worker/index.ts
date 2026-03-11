import http from 'http'
import { PrismaClient } from '@prisma/client'
import { initUserbot, resolveChannel, loadMonitoredChannels } from './TelegramUserbot'
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
