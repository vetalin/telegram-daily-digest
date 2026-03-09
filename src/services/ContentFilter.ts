const AD_WORDS = [
  'реклама',
  'промокод',
  'скидка',
  'купить',
  'партнёр',
  'партнер',
  'спонсор',
  'акция',
  'распродажа',
  'promo',
  'discount',
  'sponsor',
  'ad ',
  '#ad',
]

const URL_ONLY_REGEX = /^(https?:\/\/\S+\s*)+$/

export interface FilterResult {
  filtered: boolean
  reason?: string
}

export function filterMessage(text: string): FilterResult {
  const trimmed = text.trim()

  if (trimmed.length < 30) {
    return { filtered: true, reason: 'too_short' }
  }

  if (URL_ONLY_REGEX.test(trimmed)) {
    return { filtered: true, reason: 'url_only' }
  }

  const lower = trimmed.toLowerCase()
  const adWordCount = AD_WORDS.filter((w) => lower.includes(w)).length
  if (adWordCount >= 2) {
    return { filtered: true, reason: 'ad_keywords' }
  }

  const words = trimmed.split(/\s+/)
  if (words.length < 20) {
    const emojiRegex = /\p{Emoji}/gu
    const emojiMatches = trimmed.match(emojiRegex) ?? []
    const ratio = emojiMatches.length / words.length
    if (ratio > 0.5) {
      return { filtered: true, reason: 'emoji_spam' }
    }
  }

  return { filtered: false }
}
