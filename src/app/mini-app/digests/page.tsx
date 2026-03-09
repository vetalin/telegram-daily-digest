'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTelegramAuth } from '@/hooks/useTelegramAuth'
import { useApi } from '@/hooks/useApi'
import type { DigestListItem } from '@/types/api'

const STATUS_LABELS: Record<string, string> = {
  SENT: '✅ Отправлен',
  PENDING: '⏳ В очереди',
  FAILED: '❌ Ошибка',
}

export default function DigestsPage() {
  const router = useRouter()
  const { initData, isReady } = useTelegramAuth()
  const { request } = useApi(initData)
  const [digests, setDigests] = useState<DigestListItem[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady || !initData) return
    request<DigestListItem[]>('/api/digests')
      .then(setDigests)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [isReady, initData, request])

  if (!isReady || loading) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Загрузка...</div>
  }

  if (error) {
    return <div style={{ padding: 20, color: 'red' }}>Ошибка: {error}</div>
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: 20 }}>История дайджестов</h1>
      </div>

      {digests.length === 0 ? (
        <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>
          <p>Дайджесты ещё не создавались.</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
          {digests.map((d) => {
            const date = new Date(d.generatedAt).toLocaleDateString('ru-RU', { day: 'numeric', month: 'long', year: 'numeric' })
            return (
              <li key={d.id}>
                <Link
                  href={`/mini-app/digests/${d.id}`}
                  style={{ display: 'block', padding: '12px 0', borderBottom: '1px solid var(--tg-theme-hint-color, #ccc)', textDecoration: 'none', color: 'inherit' }}
                >
                  <div style={{ fontWeight: 600 }}>{date}</div>
                  <div style={{ fontSize: 13, opacity: 0.7, marginTop: 2 }}>
                    {STATUS_LABELS[d.status] ?? d.status} · {d.messageCount} новостей
                  </div>
                </Link>
              </li>
            )
          })}
        </ul>
      )}
    </div>
  )
}
