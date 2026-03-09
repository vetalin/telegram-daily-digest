'use client'

import { useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTelegramAuth } from '@/hooks/useTelegramAuth'
import { useApi } from '@/hooks/useApi'
import type { ChannelResponse } from '@/types/api'

export default function AddChannelPage() {
  const router = useRouter()
  const { initData } = useTelegramAuth()
  const { request } = useApi(initData)
  const [identifier, setIdentifier] = useState('')
  const [loading, setLoading] = useState(false)
  const [error, setError] = useState<string | null>(null)

  async function handleSubmit(e: React.FormEvent) {
    e.preventDefault()
    if (!identifier.trim()) return

    setLoading(true)
    setError(null)

    try {
      await request<ChannelResponse>('/api/channels', {
        method: 'POST',
        body: JSON.stringify({ identifier: identifier.trim() }),
      })
      router.push('/mini-app')
    } catch (err: unknown) {
      setError((err as Error).message)
    } finally {
      setLoading(false)
    }
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: 20 }}>Добавить канал</h1>
      </div>

      <form onSubmit={handleSubmit}>
        <label style={{ display: 'block', marginBottom: 8, fontWeight: 500 }}>
          Username или ссылка на канал
        </label>
        <input
          type="text"
          value={identifier}
          onChange={(e) => setIdentifier(e.target.value)}
          placeholder="@channelname или https://t.me/channelname"
          disabled={loading}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--tg-theme-hint-color, #ccc)',
            fontSize: 16,
            boxSizing: 'border-box',
            background: 'var(--tg-theme-bg-color, #fff)',
            color: 'var(--tg-theme-text-color, #000)',
          }}
        />

        {error && (
          <div style={{ marginTop: 8, color: 'red', fontSize: 14 }}>{error}</div>
        )}

        <button
          type="submit"
          disabled={loading || !identifier.trim()}
          style={{
            marginTop: 16,
            width: '100%',
            padding: '12px',
            background: 'var(--tg-theme-button-color, #2481cc)',
            color: 'var(--tg-theme-button-text-color, #fff)',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            cursor: loading ? 'wait' : 'pointer',
            opacity: loading || !identifier.trim() ? 0.6 : 1,
          }}
        >
          {loading ? 'Поиск...' : 'Добавить'}
        </button>
      </form>
    </div>
  )
}
