import { getOpenRouterClient } from '@/lib/openrouter'
import { createLogger } from '@/lib/logger'

const logger = createLogger('AudioService')

function stripHtml(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, '\n')
    .replace(/<\/p>/gi, '\n')
    .replace(/<\/li>/gi, '\n')
    .replace(/<[^>]+>/g, '')
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&')
    .replace(/&quot;/g, '"')
    .replace(/\n{3,}/g, '\n\n')
    .trim()
}

export async function textToAudio(text: string): Promise<Buffer> {
  const client = getOpenRouterClient()
  const cleanText = stripHtml(text)

  logger.info('Generating audio from text', { textLength: cleanText.length })

  const stream = await (client.chat.completions.create as Function)({
    model: 'openai/gpt-4o-audio-preview',
    modalities: ['text', 'audio'],
    audio: { voice: 'alloy', format: 'mp3' },
    messages: [
      {
        role: 'user',
        content: `Прочитай вслух следующий текст аналитики:\n\n${cleanText}`,
      },
    ],
    stream: true,
  })

  const audioChunks: string[] = []
  for await (const chunk of stream) {
    const audioData = (chunk as any).choices?.[0]?.delta?.audio?.data
    if (audioData) audioChunks.push(audioData)
  }

  if (audioChunks.length === 0) {
    throw new Error('No audio data received from TTS API')
  }

  logger.info('Audio generated successfully', { chunks: audioChunks.length })
  return Buffer.from(audioChunks.join(''), 'base64')
}
