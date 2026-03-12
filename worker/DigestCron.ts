import cron from 'node-cron'
import { PrismaClient } from '@prisma/client'
import { createLogger } from '../src/lib/logger'

const logger = createLogger('DigestCron')
const prisma = new PrismaClient()

const NEXTJS_URL = process.env.NEXTJS_URL ?? 'http://localhost:3000'
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? ''

function parseDigestTime(digestTime: string, timezone: string): { hour: number; minute: number } {
  const [hourStr, minuteStr] = digestTime.split(':')
  return {
    hour: parseInt(hourStr, 10),
    minute: parseInt(minuteStr, 10),
  }
}

const CATCHUP_WINDOW_MS = 2 * 60 * 60 * 1000 // 2 hours

function isTimeToSend(digestTime: string, timezone: string): boolean {
  const now = new Date()
  const userTime = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const { hour, minute } = parseDigestTime(digestTime, timezone)

  return userTime.getHours() === hour && userTime.getMinutes() === minute
}

function wasMissedRecently(digestTime: string, timezone: string): boolean {
  const now = new Date()
  const userNow = new Date(now.toLocaleString('en-US', { timeZone: timezone }))
  const { hour, minute } = parseDigestTime(digestTime, timezone)

  // Scheduled time today in user's timezone
  const scheduled = new Date(userNow)
  scheduled.setHours(hour, minute, 0, 0)

  const diffMs = userNow.getTime() - scheduled.getTime()
  return diffMs > 0 && diffMs <= CATCHUP_WINDOW_MS
}

async function hasRecentDigest(userId: number): Promise<boolean> {
  const cutoff = new Date(Date.now() - 23 * 60 * 60 * 1000)
  const recent = await prisma.digest.findFirst({
    where: {
      userId,
      generatedAt: { gte: cutoff },
      status: 'SENT',
    },
  })
  return recent !== null
}

async function sendDigests(userIds: number[]): Promise<void> {
  const response = await fetch(`${NEXTJS_URL}/api/internal/send-digests`, {
    method: 'POST',
    headers: {
      'Content-Type': 'application/json',
      'x-internal-secret': INTERNAL_SECRET,
    },
    body: JSON.stringify({ userIds }),
  })

  if (!response.ok) {
    logger.error('Failed to trigger digests', { status: response.status })
  }
}

async function triggerDigests(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { active: true },
  })

  const usersToDigest: number[] = []

  for (const user of users) {
    try {
      if (!isTimeToSend(user.digestTime, user.timezone)) continue
      if (await hasRecentDigest(user.id)) continue
      usersToDigest.push(user.id)
    } catch (error) {
      logger.error('Error checking user digest time', { userId: user.id, error })
    }
  }

  if (usersToDigest.length === 0) return

  logger.info('Triggering digests', { userIds: usersToDigest })

  try {
    await sendDigests(usersToDigest)
  } catch (error) {
    logger.error('Error calling send-digests API', { error })
  }
}

async function catchUpMissedDigests(): Promise<void> {
  const users = await prisma.user.findMany({
    where: { active: true },
  })

  const usersToDigest: number[] = []

  for (const user of users) {
    try {
      if (!wasMissedRecently(user.digestTime, user.timezone)) continue
      if (await hasRecentDigest(user.id)) continue
      usersToDigest.push(user.id)
    } catch (error) {
      logger.error('Error checking missed digest', { userId: user.id, error })
    }
  }

  if (usersToDigest.length === 0) return

  logger.info('Catch-up: sending missed digests', { userIds: usersToDigest })

  try {
    await sendDigests(usersToDigest)
  } catch (error) {
    logger.error('Error calling send-digests API during catch-up', { error })
  }
}

export function startDigestCron(): void {
  catchUpMissedDigests().catch((error) => {
    logger.error('Catch-up check failed', { error })
  })

  cron.schedule('* * * * *', async () => {
    try {
      await triggerDigests()
    } catch (error) {
      logger.error('Cron job failed', { error })
    }
  })

  logger.info('Digest cron started (every minute)')
}
