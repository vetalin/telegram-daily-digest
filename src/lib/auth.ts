import crypto from 'crypto'
import { prisma } from './prisma'

export interface TelegramUser {
  id: number
  first_name?: string
  last_name?: string
  username?: string
  language_code?: string
}

export interface ValidatedInitData {
  user: TelegramUser
  auth_date: number
  hash: string
  [key: string]: unknown
}

export function validateInitData(initData: string): ValidatedInitData {
  const botToken = process.env.BOT_TOKEN
  if (!botToken) throw new Error('BOT_TOKEN is not set')

  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash) throw new Error('Missing hash in initData')

  params.delete('hash')

  const dataCheckString = Array.from(params.entries())
    .sort(([a], [b]) => a.localeCompare(b))
    .map(([key, value]) => `${key}=${value}`)
    .join('\n')

  const secretKey = crypto.createHmac('sha256', 'WebAppData').update(botToken).digest()
  const expectedHash = crypto.createHmac('sha256', secretKey).update(dataCheckString).digest('hex')

  if (expectedHash !== hash) {
    throw new Error('Invalid initData signature')
  }

  const authDate = parseInt(params.get('auth_date') ?? '0', 10)
  const now = Math.floor(Date.now() / 1000)
  if (now - authDate > 86400) {
    throw new Error('initData expired')
  }

  const userStr = params.get('user')
  if (!userStr) throw new Error('Missing user in initData')

  const user = JSON.parse(userStr) as TelegramUser

  return {
    user,
    auth_date: authDate,
    hash,
  }
}

export async function getAuthenticatedUser(initData: string) {
  const validated = validateInitData(initData)
  const { user } = validated

  const dbUser = await prisma.user.upsert({
    where: { telegramId: BigInt(user.id) },
    update: {
      username: user.username,
      firstName: user.first_name,
    },
    create: {
      telegramId: BigInt(user.id),
      username: user.username,
      firstName: user.first_name,
    },
  })

  return dbUser
}
