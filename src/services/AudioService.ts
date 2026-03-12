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

// PCM16 at 24000 Hz, mono — default for OpenAI audio output
const SAMPLE_RATE = 24000
const CHANNELS = 1
const BIT_DEPTH = 16

function pcm16ToWav(pcmBuffer: Buffer): Buffer {
  const dataSize = pcmBuffer.length
  const header = Buffer.alloc(44)
  header.write('RIFF', 0)
  header.writeUInt32LE(36 + dataSize, 4)
  header.write('WAVE', 8)
  header.write('fmt ', 12)
  header.writeUInt32LE(16, 16) // PCM chunk size
  header.writeUInt16LE(1, 20)  // PCM format
  header.writeUInt16LE(CHANNELS, 22)
  header.writeUInt32LE(SAMPLE_RATE, 24)
  header.writeUInt32LE(SAMPLE_RATE * CHANNELS * (BIT_DEPTH / 8), 28) // byte rate
  header.writeUInt16LE(CHANNELS * (BIT_DEPTH / 8), 32) // block align
  header.writeUInt16LE(BIT_DEPTH, 34)
  header.write('data', 36)
  header.writeUInt32LE(dataSize, 40)
  return Buffer.concat([header, pcmBuffer])
}

export async function textToAudio(text: string): Promise<Buffer> {
  const client = getOpenRouterClient()
  const cleanText = stripHtml(text)

  logger.info('Generating audio from text', { textLength: cleanText.length })

  const stream = await (client.chat.completions.create as Function)({
    model: 'openai/gpt-4o-audio-preview',
    modalities: ['text', 'audio'],
    audio: { voice: 'alloy', format: 'pcm16' },
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
  const pcmBuffer = Buffer.from(audioChunks.join(''), 'base64')
  return pcm16ToWav(pcmBuffer)
}
