export interface ChannelResponse {
  id: number
  userChannelId: number
  telegramChannelId: string
  username: string | null
  title: string
  addedAt: string
  groupId: number | null
}

export interface GroupResponse {
  id: number
  name: string
  aiPrompt: string | null
  maxMessages: number
  minImportanceScore: number
  analyticsOnly: boolean
  channelCount: number
}

export interface SettingsResponse {
  digestTime: string
  timezone: string
  active: boolean
  digestPreferences: string | null
  minImportanceScore: number
  analyticsOnly: boolean
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
