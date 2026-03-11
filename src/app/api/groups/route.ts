import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

const logger = createLogger('GroupsAPI')

export async function GET(req: NextRequest) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)

    const groups = await prisma.channelGroup.findMany({
      where: { userId: user.id },
      include: { _count: { select: { userChannels: true } } },
      orderBy: { createdAt: 'asc' },
    })

    return NextResponse.json(groups.map((g) => ({
      id: g.id,
      name: g.name,
      aiPrompt: g.aiPrompt,
      channelCount: g._count.userChannels,
    })))
  } catch (error) {
    logger.error('GET /api/groups error', { error })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)
    const body = (await req.json()) as { name: string; aiPrompt?: string }

    if (!body.name?.trim()) {
      return NextResponse.json({ error: 'name is required' }, { status: 400 })
    }

    const group = await prisma.channelGroup.create({
      data: {
        userId: user.id,
        name: body.name.trim(),
        aiPrompt: body.aiPrompt?.trim() || null,
      },
    })

    return NextResponse.json({
      id: group.id,
      name: group.name,
      aiPrompt: group.aiPrompt,
      channelCount: 0,
    }, { status: 201 })
  } catch (error) {
    logger.error('POST /api/groups error', { error })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
