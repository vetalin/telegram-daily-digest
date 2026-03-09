'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTelegramAuth } from '@/hooks/useTelegramAuth'
import { useApi } from '@/hooks/useApi'
import type { DigestDetail } from '@/types/api'

export default function DigestDetailPage({ params }: { params: { id: string } }) {
  const router = useRouter()
  const { initData, isReady } = useTelegramAuth()
  const { request } = useApi(initData)
  const [digest, setDigest] = useState<DigestDetail | null>(null)
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady || !initData) return
    request<DigestDetail>(`/api/digests/${params.id}`)
      .then(setDigest)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [isReady, initData, request, params.id])

  if (!isReady || loading) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Загрузка...</div>
  }

  if (error || !digest) {
    return <div style={{ padding: 20, color: 'red' }}>Ошибка: {error ?? 'Not found'}</div>
  }

  const date = new Date(digest.generatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 16 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: 18 }}>Дайджест {date}</h1>
      </div>

      <div style={{ marginBottom: 16, fontSize: 13, opacity: 0.7 }}>
        {digest.messages.length} новостей
      </div>

      <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
        {digest.messages.map((msg) => (
          <li key={msg.messageId} style={{ marginBottom: 16, paddingBottom: 16, borderBottom: '1px solid var(--tg-theme-hint-color, #ccc)' }}>
            <div style={{ display: 'flex', justifyContent: 'space-between', marginBottom: 4 }}>
              <span style={{ fontWeight: 600, fontSize: 13 }}>{msg.rank}. [{msg.category ?? 'other'}]</span>
              <span style={{ fontSize: 12, opacity: 0.6 }}>⭐ {msg.importanceScore?.toFixed(1) ?? '—'}</span>
            </div>
            <div style={{ fontSize: 12, opacity: 0.6, marginBottom: 6 }}>{msg.channelTitle}{msg.channelUsername ? ` @${msg.channelUsername}` : ''}</div>
            <div style={{ fontSize: 14, lineHeight: 1.5 }}>{msg.summary ?? msg.text.slice(0, 200)}</div>
          </li>
        ))}
      </ul>
    </div>
  )
}
