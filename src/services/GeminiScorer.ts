import { getGeminiFlashModel } from '@/lib/gemini'
import { createLogger } from '@/lib/logger'

const logger = createLogger('GeminiScorer')

export interface ScoreResult {
  importance: number
  category: string
  isAd: boolean
  summary: string
}

const SYSTEM_PROMPT = `You are a news importance evaluator. Analyze the given Telegram message and respond with JSON only.

Rate the importance from 1 to 10:
- 10: Breaking news, major world events, crises
- 7-9: Important political, economic, or social news
- 4-6: Noteworthy developments, analysis
- 1-3: Minor updates, routine information

Categories: politics, economy, technology, science, society, sports, culture, other

Respond with valid JSON matching this schema:
{
  "importance": number (1-10),
  "category": string,
  "isAd": boolean,
  "summary": string (1-2 sentences in Russian)
}`

export async function scoreMessage(text: string): Promise<ScoreResult> {
  const model = getGeminiFlashModel()

  const result = await model.generateContent([
    SYSTEM_PROMPT,
    `Message:\n${text.slice(0, 2000)}`,
  ])

  const responseText = result.response.text()

  try {
    const parsed = JSON.parse(responseText) as ScoreResult
    return {
      importance: Math.min(10, Math.max(1, parsed.importance)),
      category: parsed.category ?? 'other',
      isAd: parsed.isAd ?? false,
      summary: parsed.summary ?? '',
    }
  } catch {
    logger.error('Failed to parse Gemini response', { responseText })
    return {
      importance: 5,
      category: 'other',
      isAd: false,
      summary: text.slice(0, 200),
    }
  }
}
