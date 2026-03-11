import { TelegramClient, sessions } from 'telegram'
import { Api } from 'telegram'
import { NewMessage, NewMessageEvent } from 'telegram/events'
import { createLogger } from '../src/lib/logger'
import { processPipelineMessage, RawMessage } from './MessagePipeline'

const logger = createLogger('TelegramUserbot')

let client: TelegramClient | null = null
let monitoredChannelIds = new Set<string>()

export async function initUserbot(): Promise<TelegramClient> {
  const sessionString = process.env.SESSION_STRING ?? ''
  const session = new sessions.StringSession(sessionString)

  client = new TelegramClient(session, parseInt(process.env.API_ID ?? '0'), process.env.API_HASH ?? '', {
    connectionRetries: 5,
  })

  await client.start({
    phoneNumber: async () => process.env.PHONE_NUMBER ?? '',
    password: async () => '',
    phoneCode: async () => {
      throw new Error('Interactive phone code input not supported. Use SESSION_STRING.')
    },
    onError: (err) => logger.error('Auth error', { error: err.message }),
  })

  logger.info('Userbot connected')

  // Populate entity cache (access hashes) for all joined channels
  try {
    await client.getDialogs({ limit: 500 })
    logger.info('Entity cache populated via getDialogs')
  } catch (e) {
    logger.warn('getDialogs failed, entity resolution may fail', { error: (e as Error).message })
  }

  client.addEventHandler(handleNewMessage, new NewMessage({}))

  return client
}

async function handleNewMessage(event: NewMessageEvent): Promise<void> {
  const message = event.message
  if (!message.text || message.text.trim().length === 0) return

  const peerId = message.peerId
  if (!peerId) return

  const channelId = 'channelId' in peerId ? peerId.channelId?.toString() : null
  if (!channelId) return

  if (!monitoredChannelIds.has(channelId)) return

  await processPipelineMessage({
    channelTelegramId: BigInt('-100' + channelId),
    telegramMsgId: message.id,
    text: message.text,
    postedAt: new Date((message.date ?? 0) * 1000),
  })
}

export function addMonitoredChannel(channelId: string): void {
  monitoredChannelIds.add(channelId)
  logger.info('Added monitored channel', { channelId })
}

export function removeMonitoredChannel(channelId: string): void {
  monitoredChannelIds.delete(channelId)
}

export async function resolveChannel(usernameOrLink: string): Promise<{ id: bigint; title: string; username: string | null }> {
  if (!client) throw new Error('Userbot not initialized')

  const username = usernameOrLink.replace(/^https?:\/\/t\.me\//, '').replace(/^@/, '')

  const entity = await client.getEntity(username)

  if (!entity) throw new Error('Channel not found')

  const id = 'id' in entity ? BigInt('-100' + entity.id.toString()) : BigInt(0)
  const title = 'title' in entity ? (entity.title as string) : ('firstName' in entity ? (entity.firstName as string) : 'Unknown')
  const entityUsername = 'username' in entity ? (entity.username as string | null) : null

  addMonitoredChannel(entity.id.toString())

  return { id, title, username: entityUsername }
}

export async function loadMonitoredChannels(channelIds: string[]): Promise<void> {
  for (const id of channelIds) {
    monitoredChannelIds.add(id)
  }
  logger.info('Loaded monitored channels', { count: channelIds.length })
}

export async function fetchChannelHistory(
  channelTelegramId: bigint,
  sinceDate: Date,
  limit = 200
): Promise<RawMessage[]> {
  if (!client) throw new Error('Userbot not initialized')

  const rawId = channelTelegramId.toString().replace(/^-100/, '')
  const entity = await client.getEntity(new Api.PeerChannel({ channelId: BigInt(rawId) }))

  const messages = await client.getMessages(entity, { limit })

  const result: RawMessage[] = []
  for (const msg of messages) {
    if (!(msg instanceof Api.Message)) continue
    if (!msg.message || msg.message.trim().length === 0) continue
    const postedAt = new Date(msg.date * 1000)
    if (postedAt < sinceDate) continue
    result.push({
      channelTelegramId,
      telegramMsgId: msg.id,
      text: msg.message,
      postedAt,
    })
  }

  logger.info('Fetched channel history', {
    channelTelegramId: channelTelegramId.toString(),
    total: messages.length,
    inRange: result.length,
  })
  return result
}
