import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { sendDigestForUser } from '@/services/DigestService'
import { createLogger } from '@/lib/logger'
import { prisma } from '@/lib/prisma'

const logger = createLogger('DigestSendNowAPI')

export async function POST(req: NextRequest) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)

    const userChannels = await prisma.userChannel.findMany({
      where: { userId: user.id },
      include: { channel: true },
    })

    if (userChannels.length > 0) {
      const channelTelegramIds = userChannels.map((uc) => uc.channel.telegramChannelId.toString())
      const workerUrl = process.env.WORKER_URL ?? 'http://localhost:3001'

      try {
        const res = await fetch(`${workerUrl}/internal/backfill`, {
          method: 'POST',
          headers: {
            'Content-Type': 'application/json',
            'x-internal-secret': process.env.INTERNAL_SECRET ?? '',
          },
          body: JSON.stringify({ channelTelegramIds, sinceHours: 24 }),
          signal: AbortSignal.timeout(120_000),
        })
        if (res.ok) {
          const result = await res.json()
          logger.info('Backfill completed', { userId: user.id, ...result })
        } else {
          logger.warn('Backfill returned non-OK', { status: res.status, userId: user.id })
        }
      } catch (e) {
        logger.warn('Backfill failed or timed out, continuing with existing messages', {
          userId: user.id,
          error: (e as Error).message,
        })
      }
    }

    await sendDigestForUser(user.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось отправить дайджест'
    logger.error('POST /api/digests/send-now error', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
