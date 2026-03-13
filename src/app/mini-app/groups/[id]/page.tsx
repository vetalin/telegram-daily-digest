'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTelegramAuth } from '@/hooks/useTelegramAuth'
import { useApi } from '@/hooks/useApi'
import type { ChannelResponse } from '@/types/api'

interface GroupDetail {
  id: number
  name: string
  aiPrompt: string | null
  maxMessages: number
  minImportanceScore: number
  analyticsOnly: boolean
  channelCount: number
  channels: ChannelResponse[]
}

export default function GroupDetailPage({ params }: { params: { id: string } }) {
  const { initData, isReady } = useTelegramAuth()
  const { request } = useApi(initData)
  const router = useRouter()
  const groupId = parseInt(params.id, 10)

  const [group, setGroup] = useState<GroupDetail | null>(null)
  const [allChannels, setAllChannels] = useState<ChannelResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [name, setName] = useState('')
  const [aiPrompt, setAiPrompt] = useState('')
  const [maxMessages, setMaxMessages] = useState(30)
  const [minImportanceScore, setMinImportanceScore] = useState(1)
  const [analyticsOnly, setAnalyticsOnly] = useState(true)
  const [saving, setSaving] = useState(false)
  const [deleting, setDeleting] = useState(false)
  const [savedMsg, setSavedMsg] = useState(false)

  useEffect(() => {
    if (!isReady || !initData) return
    Promise.all([
      request<GroupDetail>(`/api/groups/${groupId}`),
      request<ChannelResponse[]>('/api/channels'),
    ])
      .then(([g, ch]) => {
        setGroup(g)
        setName(g.name)
        setAiPrompt(g.aiPrompt ?? '')
        setMaxMessages(g.maxMessages ?? 30)
        setMinImportanceScore(g.minImportanceScore ?? 1)
        setAnalyticsOnly(g.analyticsOnly ?? true)
        setAllChannels(ch)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [isReady, initData, request, groupId])

  async function handleSave() {
    if (!name.trim()) return
    setSaving(true)
    try {
      await request(`/api/groups/${groupId}`, {
        method: 'PATCH',
        body: JSON.stringify({ name: name.trim(), aiPrompt: aiPrompt.trim() || null, maxMessages, minImportanceScore, analyticsOnly }),
      })
      setGroup((prev) => prev ? { ...prev, name: name.trim(), aiPrompt: aiPrompt.trim() || null, maxMessages, minImportanceScore, analyticsOnly } : prev)
      setSavedMsg(true)
      setTimeout(() => setSavedMsg(false), 3000)
    } catch (e: unknown) {
      alert((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  async function handleDelete() {
    if (!confirm(`Удалить группу «${group?.name}»? Каналы останутся, но станут «без группы».`)) return
    setDeleting(true)
    try {
      await request(`/api/groups/${groupId}`, { method: 'DELETE' })
      router.push('/mini-app/groups')
    } catch (e: unknown) {
      alert((e as Error).message)
      setDeleting(false)
    }
  }

  async function addChannelToGroup(channelId: number) {
    try {
      await request(`/api/channels/${channelId}`, {
        method: 'PATCH',
        body: JSON.stringify({ groupId }),
      })
      setAllChannels((prev) => prev.map((ch) => ch.id === channelId ? { ...ch, groupId } : ch))
    } catch (e: unknown) {
      alert((e as Error).message)
    }
  }

  async function removeChannelFromGroup(channelId: number) {
    try {
      await request(`/api/channels/${channelId}`, {
        method: 'PATCH',
        body: JSON.stringify({ groupId: null }),
      })
      setAllChannels((prev) => prev.map((ch) => ch.id === channelId ? { ...ch, groupId: null } : ch))
    } catch (e: unknown) {
      alert((e as Error).message)
    }
  }

  if (!isReady || loading) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Загрузка...</div>
  }

  if (error || !group) {
    return <div style={{ padding: 20, color: 'red' }}>Ошибка: {error ?? 'Группа не найдена'}</div>
  }

  const groupChannels = allChannels.filter((ch) => ch.groupId === groupId)
  const otherChannels = allChannels.filter((ch) => ch.groupId !== groupId)

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <Link href="/mini-app/groups" style={{ color: 'var(--tg-theme-link-color, #2481cc)', textDecoration: 'none', fontSize: 14 }}>
          ← Назад
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, flex: 1 }}>Редактирование группы</h1>
      </div>

      {/* Group name */}
      <div style={{ marginBottom: 12 }}>
        <label style={{ display: 'block', fontSize: 13, opacity: 0.7, marginBottom: 4 }}>Название</label>
        <input
          type="text"
          value={name}
          onChange={(e) => setName(e.target.value)}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--tg-theme-hint-color, #ccc)', fontSize: 15, boxSizing: 'border-box', background: 'var(--tg-theme-bg-color, #fff)', color: 'var(--tg-theme-text-color, #000)' }}
        />
      </div>

      {/* AI prompt */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'block', fontSize: 13, opacity: 0.7, marginBottom: 4 }}>
          AI-инструкция для дайджеста (необязательно)
        </label>
        <textarea
          value={aiPrompt}
          onChange={(e) => setAiPrompt(e.target.value)}
          placeholder="Например: «Фокус на доходность инвестиций. Выдели конкретные цифры и прогнозы.»"
          rows={3}
          style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--tg-theme-hint-color, #ccc)', fontSize: 14, boxSizing: 'border-box', resize: 'vertical', background: 'var(--tg-theme-bg-color, #fff)', color: 'var(--tg-theme-text-color, #000)', fontFamily: 'inherit' }}
        />
      </div>

      {/* Max messages slider */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
          <span>Максимум сообщений для анализа</span>
          <span style={{ fontWeight: 700, opacity: 1 }}>{maxMessages}</span>
        </label>
        <input
          type="range"
          min={5}
          max={100}
          step={5}
          value={maxMessages}
          onChange={(e) => setMaxMessages(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--tg-theme-button-color, #2481cc)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.5, marginTop: 2 }}>
          <span>5 (быстро)</span>
          <span>100 (детально)</span>
        </div>
      </div>

      {/* Min importance score slider */}
      <div style={{ marginBottom: 16 }}>
        <label style={{ display: 'flex', justifyContent: 'space-between', fontSize: 13, opacity: 0.7, marginBottom: 6 }}>
          <span>Минимальная оценка новости</span>
          <span style={{ fontWeight: 700, opacity: 1 }}>{minImportanceScore === 1 ? 'все' : `${minImportanceScore}+`}</span>
        </label>
        <input
          type="range"
          min={1}
          max={10}
          step={1}
          value={minImportanceScore}
          onChange={(e) => setMinImportanceScore(Number(e.target.value))}
          style={{ width: '100%', accentColor: 'var(--tg-theme-button-color, #2481cc)' }}
        />
        <div style={{ display: 'flex', justifyContent: 'space-between', fontSize: 11, opacity: 0.5, marginTop: 2 }}>
          <span>1 (все новости)</span>
          <span>10 (только топ)</span>
        </div>
        {minImportanceScore >= 8 && (
          <div style={{ fontSize: 12, color: 'var(--tg-theme-hint-color, #888)', marginTop: 4 }}>
            Будут приходить только самые важные новости
          </div>
        )}
      </div>

      {/* Analytics only toggle */}
      <div style={{ marginBottom: 20, padding: '12px 14px', background: 'var(--tg-theme-secondary-bg-color, #f5f5f5)', borderRadius: 10 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={analyticsOnly}
            onChange={(e) => setAnalyticsOnly(e.target.checked)}
            style={{ marginTop: 2, width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--tg-theme-button-color, #2481cc)', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 14, fontWeight: 600 }}>Только аналитика нейросети</div>
            <div style={{ fontSize: 12, opacity: 0.6, marginTop: 3 }}>
              Вместо списка новостей — один развёрнутый аналитический обзор со ссылками на источники. Список новостей отправляться не будет.
            </div>
          </div>
        </label>
      </div>

      <button
        onClick={handleSave}
        disabled={saving || !name.trim()}
        style={{ width: '100%', padding: '12px', background: 'var(--tg-theme-button-color, #2481cc)', color: 'var(--tg-theme-button-text-color, #fff)', border: 'none', borderRadius: 8, fontSize: 15, cursor: saving || !name.trim() ? 'default' : 'pointer', opacity: saving || !name.trim() ? 0.6 : 1, marginBottom: 8 }}
      >
        {saving ? 'Сохраняем...' : 'Сохранить'}
      </button>

      {savedMsg && (
        <div style={{ textAlign: 'center', fontSize: 13, color: 'green', marginBottom: 8 }}>
          ✓ Изменения сохранены
        </div>
      )}

      {/* Channels in group */}
      <div style={{ marginTop: 24, marginBottom: 8 }}>
        <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
          Каналы в группе ({groupChannels.length})
        </div>
        {groupChannels.length === 0 ? (
          <div style={{ fontSize: 13, opacity: 0.5, padding: '8px 0' }}>Нет каналов. Добавьте из списка ниже.</div>
        ) : (
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {groupChannels.map((ch) => (
              <li key={ch.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--tg-theme-hint-color, #ccc)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{ch.title}</div>
                  {ch.username && <div style={{ fontSize: 12, opacity: 0.6 }}>@{ch.username}</div>}
                </div>
                <button
                  onClick={() => removeChannelFromGroup(ch.id)}
                  style={{ background: 'none', border: 'none', color: 'var(--tg-theme-hint-color, #888)', cursor: 'pointer', fontSize: 13, padding: 4 }}
                >
                  Убрать
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>

      {/* Ungrouped / other group channels to add */}
      {otherChannels.length > 0 && (
        <div style={{ marginTop: 16, marginBottom: 8 }}>
          <div style={{ fontSize: 13, fontWeight: 700, opacity: 0.7, textTransform: 'uppercase', letterSpacing: 0.5, marginBottom: 8 }}>
            Добавить канал
          </div>
          <ul style={{ listStyle: 'none', margin: 0, padding: 0 }}>
            {otherChannels.map((ch) => (
              <li key={ch.id} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '10px 0', borderBottom: '1px solid var(--tg-theme-hint-color, #ccc)' }}>
                <div>
                  <div style={{ fontWeight: 600 }}>{ch.title}</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>
                    {ch.username ? `@${ch.username}` : ''}
                    {ch.groupId !== null ? ' · в другой группе' : ''}
                  </div>
                </div>
                <button
                  onClick={() => addChannelToGroup(ch.id)}
                  style={{ background: 'none', border: '1px solid var(--tg-theme-button-color, #2481cc)', color: 'var(--tg-theme-button-color, #2481cc)', cursor: 'pointer', fontSize: 13, padding: '4px 10px', borderRadius: 6 }}
                >
                  + Добавить
                </button>
              </li>
            ))}
          </ul>
        </div>
      )}

      {/* Delete group */}
      <div style={{ marginTop: 32 }}>
        <button
          onClick={handleDelete}
          disabled={deleting}
          style={{ width: '100%', padding: '12px', background: 'none', color: 'red', border: '1px solid red', borderRadius: 8, fontSize: 15, cursor: deleting ? 'default' : 'pointer', opacity: deleting ? 0.6 : 1 }}
        >
          {deleting ? 'Удаляем...' : '🗑 Удалить группу'}
        </button>
      </div>
    </div>
  )
}
