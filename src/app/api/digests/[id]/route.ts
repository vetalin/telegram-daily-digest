import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

const logger = createLogger('DigestsAPI')

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)
    const digestId = parseInt(params.id, 10)

    if (isNaN(digestId)) {
      return NextResponse.json({ error: 'Invalid digest id' }, { status: 400 })
    }

    const digest = await prisma.digest.findFirst({
      where: { id: digestId, userId: user.id },
      include: {
        messages: {
          orderBy: { rank: 'asc' },
          include: {
            message: {
              include: { channel: true },
            },
          },
        },
      },
    })

    if (!digest) {
      return NextResponse.json({ error: 'Digest not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: digest.id,
      generatedAt: digest.generatedAt,
      sentAt: digest.sentAt,
      periodStart: digest.periodStart,
      periodEnd: digest.periodEnd,
      status: digest.status,
      messages: digest.messages.map((dm) => ({
        rank: dm.rank,
        messageId: dm.messageId,
        text: dm.message.text,
        summary: dm.message.summary,
        category: dm.message.category,
        importanceScore: dm.message.importanceScore,
        channelTitle: dm.message.channel.title,
        channelUsername: dm.message.channel.username,
        postedAt: dm.message.postedAt,
      })),
    })
  } catch (error) {
    logger.error('GET /api/digests/:id error', { error })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
