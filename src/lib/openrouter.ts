import OpenAI from 'openai'

let client: OpenAI | null = null

export function getOpenRouterClient(): OpenAI {
  if (!client) {
    const apiKey = process.env.OPENROUTER_API_KEY
    if (!apiKey) throw new Error('OPENROUTER_API_KEY is not set')
    client = new OpenAI({
      baseURL: 'https://openrouter.ai/api/v1',
      apiKey,
    })
  }
  return client
}
