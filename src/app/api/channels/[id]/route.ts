import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

const logger = createLogger('ChannelsAPI')

export async function DELETE(req: NextRequest, { params }: { params: { id: string } }) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)
    const channelId = parseInt(params.id, 10)

    if (isNaN(channelId)) {
      return NextResponse.json({ error: 'Invalid channel id' }, { status: 400 })
    }

    const deleted = await prisma.userChannel.deleteMany({
      where: { userId: user.id, channelId },
    })

    if (deleted.count === 0) {
      return NextResponse.json({ error: 'Channel not found' }, { status: 404 })
    }

    return NextResponse.json({ ok: true })
  } catch (error) {
    logger.error('DELETE /api/channels/:id error', { error })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}
