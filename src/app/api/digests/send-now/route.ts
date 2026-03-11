import { NextRequest, NextResponse } from 'next/server'
import { getAuthenticatedUser } from '@/lib/auth'
import { sendDigestForUser } from '@/services/DigestService'
import { createLogger } from '@/lib/logger'

const logger = createLogger('DigestSendNowAPI')

export async function POST(req: NextRequest) {
  const initData = req.headers.get('x-telegram-init-data')
  if (!initData) return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })

  try {
    const user = await getAuthenticatedUser(initData)
    await sendDigestForUser(user.id)
    return NextResponse.json({ ok: true })
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Не удалось отправить дайджест'
    logger.error('POST /api/digests/send-now error', { error })
    return NextResponse.json({ error: message }, { status: 400 })
  }
}
