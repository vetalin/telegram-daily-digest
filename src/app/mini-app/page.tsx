'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useTelegramAuth } from '@/hooks/useTelegramAuth'
import { useApi } from '@/hooks/useApi'
import type { ChannelResponse, GroupResponse } from '@/types/api'

export default function ChannelsPage() {
  const { initData, isReady } = useTelegramAuth()
  const { request } = useApi(initData)
  const [channels, setChannels] = useState<ChannelResponse[]>([])
  const [groups, setGroups] = useState<GroupResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [sendingDigest, setSendingDigest] = useState(false)
  const [digestSent, setDigestSent] = useState(false)
  const [digestError, setDigestError] = useState<string | null>(null)

  useEffect(() => {
    if (!isReady || !initData) return
    Promise.all([
      request<ChannelResponse[]>('/api/channels'),
      request<GroupResponse[]>('/api/groups'),
    ])
      .then(([ch, gr]) => {
        setChannels(ch)
        setGroups(gr)
      })
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

  async function handleSendNow() {
    setSendingDigest(true)
    setDigestError(null)
    setDigestSent(false)
    try {
      await request('/api/digests/send-now', { method: 'POST' })
      setDigestSent(true)
      setTimeout(() => setDigestSent(false), 4000)
    } catch (e: unknown) {
      setDigestError((e as Error).message)
      setTimeout(() => setDigestError(null), 4000)
    } finally {
      setSendingDigest(false)
    }
  }

  if (!isReady || loading) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Загрузка...</div>
  }

  if (error) {
    return <div style={{ padding: 20, color: 'red' }}>Ошибка: {error}</div>
  }

  // Build grouped channel lists
  const groupedChannels: Record<number, ChannelResponse[]> = {}
  const ungroupedChannels: ChannelResponse[] = []

  for (const ch of channels) {
    if (ch.groupId !== null && ch.groupId !== undefined) {
      if (!groupedChannels[ch.groupId]) groupedChannels[ch.groupId] = []
      groupedChannels[ch.groupId].push(ch)
    } else {
      ungroupedChannels.push(ch)
    }
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
        <>
          {/* Grouped sections */}
          {groups.map((group) => {
            const groupChannels = groupedChannels[group.id] ?? []
            if (groupChannels.length === 0) return null
            return (
              <div key={group.id} style={{ marginBottom: 16 }}>
                <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: 8 }}>
                  <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5 }}>
                    📂 {group.name}
                  </div>
                  <Link href={`/mini-app/groups/${group.id}`} style={{ fontSize: 12, color: 'var(--tg-theme-link-color, #2481cc)', textDecoration: 'none' }}>
                    Изменить
                  </Link>
                </div>
                <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                  {groupChannels.map((ch) => (
                    <li key={ch.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--tg-theme-hint-color, #ccc)' }}>
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
              </div>
            )
          })}

          {/* Ungrouped channels */}
          {ungroupedChannels.length > 0 && (
            <div style={{ marginBottom: 16 }}>
              {groups.length > 0 && (
                <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
                  Без группы
                </div>
              )}
              <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
                {ungroupedChannels.map((ch) => (
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
            </div>
          )}
        </>
      )}

      <div style={{ marginTop: 24 }}>
        <button
          onClick={handleSendNow}
          disabled={sendingDigest || channels.length === 0}
          style={{
            width: '100%',
            padding: '12px',
            background: 'var(--tg-theme-button-color, #2481cc)',
            color: 'var(--tg-theme-button-text-color, #fff)',
            border: 'none',
            borderRadius: 8,
            fontSize: 16,
            cursor: (sendingDigest || channels.length === 0) ? 'default' : 'pointer',
            opacity: (sendingDigest || channels.length === 0) ? 0.6 : 1,
            marginBottom: 8,
          }}
        >
          {sendingDigest ? '⏳ Нейросеть думает...' : '📰 Получить дайджест сейчас'}
        </button>

        {sendingDigest && (
          <div style={{ textAlign: 'center', fontSize: 13, color: 'var(--tg-theme-hint-color, #888)', marginBottom: 8 }}>
            Анализируем сообщения и формируем дайджест.<br />Это может занять до 5 минут.
          </div>
        )}

        {digestSent && (
          <div style={{ textAlign: 'center', fontSize: 14, color: 'green', marginBottom: 8 }}>
            ✓ Дайджест отправлен в чат!
          </div>
        )}
        {digestError && (
          <div style={{ textAlign: 'center', fontSize: 14, color: 'red', marginBottom: 8 }}>
            {digestError}
          </div>
        )}

        <div style={{ display: 'flex', gap: 8, flexWrap: 'wrap' }}>
          <Link href="/mini-app/groups" style={{ flex: 1, textAlign: 'center', padding: '10px', background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)', borderRadius: 8, textDecoration: 'none', color: 'inherit', minWidth: 100 }}>
            📂 Группы
          </Link>
          <Link href="/mini-app/settings" style={{ flex: 1, textAlign: 'center', padding: '10px', background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)', borderRadius: 8, textDecoration: 'none', color: 'inherit', minWidth: 100 }}>
            ⚙️ Настройки
          </Link>
          <Link href="/mini-app/digests" style={{ flex: 1, textAlign: 'center', padding: '10px', background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)', borderRadius: 8, textDecoration: 'none', color: 'inherit', minWidth: 100 }}>
            📰 Дайджесты
          </Link>
        </div>
      </div>
    </div>
  )
}
