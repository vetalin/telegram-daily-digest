import { getOpenRouterClient } from '@/lib/openrouter'
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

const DIGEST_SUMMARY_PROMPT = `Ты — аналитик новостей. Тебе дан список самых важных новостей за день из Telegram-каналов пользователя.
Напиши краткое аналитическое резюме на русском языке:
- Выдели 3-5 главных тем/событий дня
- Проанализируй связи между событиями, если они есть
- Сделай краткие выводы о том, что происходит
- Укажи, на что стоит обратить особое внимание

Формат ответа: HTML для Telegram (не JSON, не Markdown). Используй только теги: <b>заголовок</b>, <i>курсив</i>. Для разделов используй <b>Заголовок</b> на отдельной строке. Для пунктов используй символ • в начале строки. Не используй # ## ### ** __ и другие Markdown-символы.`

export interface DigestSummaryInput {
  category: string
  channelTitle: string
  summary: string
  score: number
}

export async function generateDigestSummary(messages: DigestSummaryInput[], customPrompt?: string): Promise<string> {
  let client
  try {
    client = getOpenRouterClient()
  } catch (err) {
    logger.error('Failed to get OpenRouter client for digest summary', { error: err })
    throw err
  }

  const newsBlock = messages
    .map((m, i) => `${i + 1}. [${m.category}] ${m.channelTitle}: ${m.summary} (важность: ${m.score.toFixed(1)})`)
    .join('\n')

  const systemPrompt = customPrompt
    ? `${DIGEST_SUMMARY_PROMPT}\n\nДополнительные инструкции: ${customPrompt}`
    : DIGEST_SUMMARY_PROMPT

  let completion
  try {
    completion = await client.chat.completions.create({
      model: 'google/gemini-3-flash-preview',
      messages: [
        { role: 'system', content: systemPrompt },
        { role: 'user', content: `Новости дня:\n${newsBlock}` },
      ],
    })
  } catch (err) {
    logger.error('OpenRouter API call failed for digest summary', { error: err })
    throw err
  }

  const result = completion.choices[0].message.content ?? ''
  logger.info('Digest summary generated', { length: result.length })
  return result
}

export async function scoreMessage(text: string): Promise<ScoreResult> {
  const textPreview = text.slice(0, 80).replace(/\n/g, ' ')
  logger.info('Scoring message', { textPreview, textLength: text.length })

  let client
  try {
    client = getOpenRouterClient()
  } catch (err) {
    logger.error('Failed to get OpenRouter client (OPENROUTER_API_KEY missing?)', { error: err })
    throw err
  }

  let completion
  try {
    completion = await client.chat.completions.create({
      model: 'google/gemini-3-flash-preview',
      response_format: { type: 'json_object' },
      messages: [
        { role: 'system', content: SYSTEM_PROMPT },
        { role: 'user', content: `Message:\n${text.slice(0, 2000)}` },
      ],
    })
    logger.debug('OpenRouter API call succeeded')
  } catch (err) {
    logger.error('OpenRouter API call failed', { error: err })
    throw err
  }

  const responseText = completion.choices[0].message.content ?? ''
  logger.debug('OpenRouter raw response', { responseText })

  try {
    const parsed = JSON.parse(responseText) as ScoreResult
    const scored: ScoreResult = {
      importance: Math.min(10, Math.max(1, parsed.importance)),
      category: parsed.category ?? 'other',
      isAd: parsed.isAd ?? false,
      summary: parsed.summary ?? '',
    }
    logger.info('Message scored', { score: scored.importance, category: scored.category, isAd: scored.isAd })
    return scored
  } catch {
    logger.error('Failed to parse OpenRouter JSON response', { responseText })
    return {
      importance: 5,
      category: 'other',
      isAd: false,
      summary: text.slice(0, 200),
    }
  }
}
