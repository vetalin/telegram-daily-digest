import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

const logger = createLogger('DigestsAPI')

export async function GET(req: NextRequest) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)

    const digests = await prisma.digest.findMany({
      where: { userId: user.id },
      orderBy: { generatedAt: 'desc' },
      take: 20,
      include: {
        _count: { select: { messages: true } },
      },
    })

    return NextResponse.json(digests.map((d) => ({
      id: d.id,
      generatedAt: d.generatedAt,
      sentAt: d.sentAt,
      periodStart: d.periodStart,
      periodEnd: d.periodEnd,
      status: d.status,
      messageCount: d._count.messages,
    })))
  } catch (error) {
    logger.error('GET /api/digests error', { error })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
