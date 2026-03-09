import { NextRequest, NextResponse } from 'next/server'
import { sendDigestForUser } from '@/services/DigestService'
import { createLogger } from '@/lib/logger'

const logger = createLogger('InternalAPI')
const INTERNAL_SECRET = process.env.INTERNAL_SECRET ?? ''

export async function POST(req: NextRequest) {
  const secret = req.headers.get('x-internal-secret')
  if (!secret || secret !== INTERNAL_SECRET) {
    return NextResponse.json({ error: 'Unauthorized' }, { status: 401 })
  }

  try {
    const { userIds } = (await req.json()) as { userIds: number[] }

    if (!Array.isArray(userIds) || userIds.length === 0) {
      return NextResponse.json({ error: 'userIds required' }, { status: 400 })
    }

    const results = await Promise.allSettled(userIds.map((id) => sendDigestForUser(id)))

    const summary = results.map((r, i) => ({
      userId: userIds[i],
      status: r.status,
      error: r.status === 'rejected' ? (r.reason as Error).message : undefined,
    }))

    logger.info('Digests processed', { summary })
    return NextResponse.json({ results: summary })
  } catch (error) {
    logger.error('send-digests error', { error })
    return NextResponse.json({ error: 'Internal error' }, { status: 500 })
  }
}
