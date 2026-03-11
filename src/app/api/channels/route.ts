import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

const logger = createLogger('ChannelsAPI')
const WORKER_URL = process.env.WORKER_URL ?? 'http://localhost:3001'
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? ''

export async function GET(req: NextRequest) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)

    const userChannels = await prisma.userChannel.findMany({
      where: { userId: user.id },
      include: { channel: true },
      orderBy: { addedAt: 'desc' },
    })

    return NextResponse.json(userChannels.map((uc) => ({
      id: uc.channel.id,
      userChannelId: uc.id,
      telegramChannelId: uc.channel.telegramChannelId.toString(),
      username: uc.channel.username,
      title: uc.channel.title,
      addedAt: uc.addedAt,
      groupId: uc.groupId,
    })))
  } catch (error) {
    logger.error('GET /api/channels error', { error })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function POST(req: NextRequest) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)
    const { identifier } = (await req.json()) as { identifier: string }

    if (!identifier?.trim()) {
      return NextResponse.json({ error: 'identifier is required' }, { status: 400 })
    }

    // Ask worker to resolve the channel via GramJS
    const workerRes = await fetch(`${WORKER_URL}/internal/resolve-channel`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-internal-secret': INTERNAL_SECRET,
      },
      body: JSON.stringify({ identifier: identifier.trim() }),
    })

    if (!workerRes.ok) {
      const err = await workerRes.json() as { error: string }
      return NextResponse.json({ error: err.error ?? 'Channel not found' }, { status: 404 })
    }

    const resolved = await workerRes.json() as { id: string; title: string; username: string | null }

    const channel = await prisma.channel.upsert({
      where: { telegramChannelId: BigInt(resolved.id) },
      update: { title: resolved.title, username: resolved.username },
      create: {
        telegramChannelId: BigInt(resolved.id),
        title: resolved.title,
        username: resolved.username,
      },
    })

    const existing = await prisma.userChannel.findUnique({
      where: { userId_channelId: { userId: user.id, channelId: channel.id } },
    })

    if (existing) {
      return NextResponse.json({ error: 'Channel already added' }, { status: 409 })
    }

    const userChannel = await prisma.userChannel.create({
      data: { userId: user.id, channelId: channel.id },
      include: { channel: true },
    })

    return NextResponse.json({
      id: userChannel.channel.id,
      userChannelId: userChannel.id,
      telegramChannelId: userChannel.channel.telegramChannelId.toString(),
      username: userChannel.channel.username,
      title: userChannel.channel.title,
      addedAt: userChannel.addedAt,
    }, { status: 201 })
  } catch (error) {
    logger.error('POST /api/channels error', { error })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
