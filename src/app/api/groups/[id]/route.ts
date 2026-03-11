import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

const logger = createLogger('GroupsAPI')

export async function GET(req: NextRequest, { params }: { params: { id: string } }) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)
    const groupId = parseInt(params.id, 10)

    if (isNaN(groupId)) {
      return NextResponse.json({ error: 'Invalid group id' }, { status: 400 })
    }

    const group = await prisma.channelGroup.findUnique({
      where: { id: groupId },
      include: {
        userChannels: {
          include: { channel: true },
        },
      },
    })

    if (!group || group.userId !== user.id) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    return NextResponse.json({
      id: group.id,
      name: group.name,
      aiPrompt: group.aiPrompt,
      maxMessages: group.maxMessages,
      channelCount: group.userChannels.length,
      channels: group.userChannels.map((uc) => ({
        id: uc.channel.id,
        userChannelId: uc.id,
        telegramChannelId: uc.channel.telegramChannelId.toString(),
        username: uc.channel.username,
        title: uc.channel.title,
        addedAt: uc.addedAt,
        groupId: uc.groupId,
      })),
    })
  } catch (error) {
    logger.error('GET /api/groups/:id error', { error })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest, { params }: { params: { id: string } }) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)
    const groupId = parseInt(params.id, 10)

    if (isNaN(groupId)) {
      return NextResponse.json({ error: 'Invalid group id' }, { status: 400 })
    }

    const existing = await prisma.channelGroup.findUnique({ where: { id: groupId } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    const body = (await req.json()) as { name?: string; aiPrompt?: string | null; maxMessages?: number }

    const group = await prisma.channelGroup.update({
      where: { id: groupId },
      data: {
        ...(body.name !== undefined && { name: body.name.trim() }),
        ...(body.aiPrompt !== undefined && { aiPrompt: body.aiPrompt?.trim() || null }),
        ...(body.maxMessages !== undefined && { maxMessages: Math.min(100, Math.max(5, Math.round(body.maxMessages))) }),
      },
    })

    return NextResponse.json({
      id: group.id,
      name: group.name,
      aiPrompt: group.aiPrompt,
      maxMessages: group.maxMessages,
    })
  } catch (error) {
    logger.error('PATCH /api/groups/:id error', { error })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)
    const groupId = parseInt(params.id, 10)

    if (isNaN(groupId)) {
      return NextResponse.json({ error: 'Invalid group id' }, { status: 400 })
    }

    const existing = await prisma.channelGroup.findUnique({ where: { id: groupId } })
    if (!existing || existing.userId !== user.id) {
      return NextResponse.json({ error: 'Group not found' }, { status: 404 })
    }

    await prisma.channelGroup.delete({ where: { id: groupId } })

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error('DELETE /api/groups/:id error', { error })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
