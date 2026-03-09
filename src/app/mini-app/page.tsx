'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTelegramAuth } from '@/hooks/useTelegramAuth'
import { useApi } from '@/hooks/useApi'
import type { ChannelResponse } from '@/types/api'

export default function ChannelsPage() {
  const { initData, isReady } = useTelegramAuth()
  const { request } = useApi(initData)
  const [channels, setChannels] = useState<ChannelResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady || !initData) return
    request<ChannelResponse[]>('/api/channels')
      .then(setChannels)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [isReady, initData, request])

  async function removeChannel(channelId: number) {
    try {
      await request(`/api/channels/${channelId}`, { method: 'DELETE' })
      setChannels((prev) => prev.filter((c) => c.id !== channelId))
    } catch (e: unknown) {
      alert((e as Error).message)
    }
  }

  if (!isReady || loading) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Загрузка...</div>
  }

  if (error) {
    return <div style={{ padding: 20, color: 'red' }}>Ошибка: {error}</div>
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 16 }}>
        <h1 style={{ margin: 0, fontSize: 20 }}>Мои каналы</h1>
        <Link href="/mini-app/channels/add" style={{ padding: '8px 16px', background: 'var(--tg-theme-button-color, #2481cc)', color: 'var(--tg-theme-button-text-color, #fff)', borderRadius: 8, textDecoration: 'none', fontSize: 14 }}>
          + Добавить
        </Link>
      </div>

      {channels.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>
          <p>У вас пока нет каналов.</p>
          <p>Нажмите «+ Добавить», чтобы начать.</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {channels.map((ch) => (
            <li key={ch.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--tg-theme-hint-color, #ccc)' }}>
              <div>
                <div style={{ fontWeight: 600 }}>{ch.title}</div>
                {ch.username && <div style={{ fontSize: 12, opacity: 0.6 }}>@{ch.username}</div>}
              </div>
              <button
                onClick={() => removeChannel(ch.id)}
                style={{ background: 'none', border: 'none', color: 'red', cursor: 'pointer', fontSize: 18, padding: 4 }}
              >
                ✕
              </button>
            </li>
          ))}
        </ul>
      )}

      <div style={{ marginTop: 24, display: 'flex', gap: 8 }}>
        <Link href="/mini-app/settings" style={{ flex: 1, textAlign: 'center', padding: '10px', background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>
          ⚙️ Настройки
        </Link>
        <Link href="/mini-app/digests" style={{ flex: 1, textAlign: 'center', padding: '10px', background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)', borderRadius: 8, textDecoration: 'none', color: 'inherit' }}>
          📰 Дайджесты
        </Link>
      </div>
    </div>
  )
}
