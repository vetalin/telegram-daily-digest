export interface ChannelResponse {
  id: number
  userChannelId: number
  telegramChannelId: string
  username: string | null
  title: string
  addedAt: string
}

export interface SettingsResponse {
  digestTime: string
  timezone: string
  active: boolean
}

export interface DigestListItem {
  id: number
  generatedAt: string
  sentAt: string | null
  periodStart: string
  periodEnd: string
  status: 'PENDING' | 'SENT' | 'FAILED'
  messageCount: number
}

export interface DigestMessage {
  rank: number
  messageId: number
  text: string
  summary: string | null
  category: string | null
  importanceScore: number | null
  channelTitle: string
  channelUsername: string | null
  postedAt: string
}

export interface DigestDetail extends Omit<DigestListItem, 'messageCount'> {
  messages: DigestMessage[]
}
