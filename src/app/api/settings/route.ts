import { NextRequest, NextResponse } from 'next/server'
import { prisma } from '@/lib/prisma'
import { getAuthenticatedUser } from '@/lib/auth'
import { createLogger } from '@/lib/logger'

const logger = createLogger('SettingsAPI')

export async function GET(req: NextRequest) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)
    return NextResponse.json({
      digestTime: user.digestTime,
      timezone: user.timezone,
      active: user.active,
    })
  } catch (error) {
    logger.error('GET /api/settings error', { error })
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }
}

export async function PATCH(req: NextRequest) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)
    const body = (await req.json()) as Partial<{ digestTime: string; timezone: string; active: boolean }>

    const updates: { digestTime?: string; timezone?: string; active?: boolean } = {}

    if (body.digestTime !== undefined) {
      if (!/^\d{2}:\d{2}$/.test(body.digestTime)) {
        return NextResponse.json({ error: 'Invalid digestTime format (HH:MM)' }, { status: 400 })
      }
      updates.digestTime = body.digestTime
    }

    if (body.timezone !== undefined) {
      try {
        Intl.DateTimeFormat(undefined, { timeZone: body.timezone })
        updates.timezone = body.timezone
      } catch {
        return NextResponse.json({ error: 'Invalid timezone' }, { status: 400 })
      }
    }

    if (body.active !== undefined) {
      updates.active = body.active
    }

    const updated = await prisma.user.update({
      where: { id: user.id },
      data: updates,
    })

    return NextResponse.json({
      digestTime: updated.digestTime,
      timezone: updated.timezone,
      active: updated.active,
    })
  } catch (error) {
    logger.error('PATCH /api/settings error', { error })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
