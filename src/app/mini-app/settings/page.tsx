'use client'

import { useEffect, useState } from 'react'
import { useRouter } from 'next/navigation'
import { useTelegramAuth } from '@/hooks/useTelegramAuth'
import { useApi } from '@/hooks/useApi'
import type { SettingsResponse } from '@/types/api'

const TIMEZONES = [
  'UTC',
  'Europe/Moscow',
  'Europe/Kiev',
  'Europe/Minsk',
  'Asia/Almaty',
  'Asia/Tashkent',
  'Asia/Tbilisi',
  'Europe/London',
  'Europe/Berlin',
  'America/New_York',
  'America/Los_Angeles',
]

export default function SettingsPage() {
  const router = useRouter()
  const { initData, isReady } = useTelegramAuth()
  const { request } = useApi(initData)
  const [settings, setSettings] = useState<SettingsResponse | null>(null)
  const [digestTime, setDigestTime] = useState('08:00')
  const [timezone, setTimezone] = useState('UTC')
  const [digestPreferences, setDigestPreferences] = useState('')
  const [minImportanceScore, setMinImportanceScore] = useState(1)
  const [analyticsOnly, setAnalyticsOnly] = useState(false)
  const [loading, setLoading] = useState(true)
  const [saving, setSaving] = useState(false)
  const [error, setError] = useState<string | null>(null)
  const [saved, setSaved] = useState(false)

  useEffect(() => {
    if (!isReady || !initData) return
    request<SettingsResponse>('/api/settings')
      .then((s) => {
        setSettings(s)
        setDigestTime(s.digestTime)
        setTimezone(s.timezone)
        setDigestPreferences(s.digestPreferences ?? '')
        setMinImportanceScore(s.minImportanceScore ?? 1)
        setAnalyticsOnly(s.analyticsOnly ?? false)
      })
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [isReady, initData, request])

  async function handleSave() {
    setSaving(true)
    setError(null)
    setSaved(false)
    try {
      const updated = await request<SettingsResponse>('/api/settings', {
        method: 'PATCH',
        body: JSON.stringify({
          digestTime,
          timezone,
          digestPreferences: digestPreferences.trim() || null,
          minImportanceScore,
          analyticsOnly,
        }),
      })
      setSettings(updated)
      setSaved(true)
      setTimeout(() => setSaved(false), 2000)
    } catch (e: unknown) {
      setError((e as Error).message)
    } finally {
      setSaving(false)
    }
  }

  if (!isReady || loading) {
    return <div style={{ padding: 20, textAlign: 'center' }}>Загрузка...</div>
  }

  return (
    <div style={{ padding: 16 }}>
      <div style={{ display: 'flex', alignItems: 'center', gap: 12, marginBottom: 24 }}>
        <button onClick={() => router.back()} style={{ background: 'none', border: 'none', cursor: 'pointer', fontSize: 20 }}>
          ←
        </button>
        <h1 style={{ margin: 0, fontSize: 20 }}>Настройки</h1>
      </div>

      <label style={{ display: 'block', marginBottom: 16 }}>
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Время дайджеста</div>
        <input
          type="time"
          value={digestTime}
          onChange={(e) => setDigestTime(e.target.value)}
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
      </label>

      <label style={{ display: 'block', marginBottom: 24 }}>
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Часовой пояс</div>
        <select
          value={timezone}
          onChange={(e) => setTimezone(e.target.value)}
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
        >
          {TIMEZONES.map((tz) => (
            <option key={tz} value={tz}>{tz}</option>
          ))}
        </select>
      </label>

      <label style={{ display: 'block', marginBottom: 24 }}>
        <div style={{ fontWeight: 500, marginBottom: 6 }}>Пожелания к дайджесту</div>
        <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>
          Опишите, какие темы и новости интересуют вас больше всего, что выделить в первую очередь.
        </div>
        <textarea
          value={digestPreferences}
          onChange={(e) => setDigestPreferences(e.target.value)}
          placeholder="Например: интересует крипта и стартапы, особенно про AI. Политику не присылать. Выделять новости про инвестиции."
          rows={5}
          maxLength={1000}
          style={{
            width: '100%',
            padding: '10px 12px',
            borderRadius: 8,
            border: '1px solid var(--tg-theme-hint-color, #ccc)',
            fontSize: 15,
            boxSizing: 'border-box',
            background: 'var(--tg-theme-bg-color, #fff)',
            color: 'var(--tg-theme-text-color, #000)',
            resize: 'vertical',
            lineHeight: 1.5,
          }}
        />
        <div style={{ textAlign: 'right', fontSize: 12, opacity: 0.4, marginTop: 4 }}>
          {digestPreferences.length}/1000
        </div>
      </label>

      {/* Min importance score */}
      <div style={{ marginBottom: 20 }}>
        <div style={{ fontWeight: 500, marginBottom: 6 }}>
          Минимальная оценка новости
          <span style={{ marginLeft: 8, fontWeight: 700, color: 'var(--tg-theme-button-color, #2481cc)' }}>
            {minImportanceScore === 1 ? 'все' : `${minImportanceScore}+`}
          </span>
        </div>
        <div style={{ fontSize: 13, opacity: 0.6, marginBottom: 8 }}>
          Новости с оценкой ниже указанной не будут попадать в дайджест.
        </div>
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
      </div>

      {/* Analytics only toggle */}
      <div style={{ marginBottom: 24, padding: '12px 14px', background: 'var(--tg-theme-secondary-bg-color, #f5f5f5)', borderRadius: 10 }}>
        <label style={{ display: 'flex', alignItems: 'flex-start', gap: 12, cursor: 'pointer' }}>
          <input
            type="checkbox"
            checked={analyticsOnly}
            onChange={(e) => setAnalyticsOnly(e.target.checked)}
            style={{ marginTop: 2, width: 18, height: 18, cursor: 'pointer', accentColor: 'var(--tg-theme-button-color, #2481cc)', flexShrink: 0 }}
          />
          <div>
            <div style={{ fontSize: 15, fontWeight: 600 }}>Только аналитика нейросети</div>
            <div style={{ fontSize: 13, opacity: 0.6, marginTop: 4 }}>
              Вместо списка новостей — один развёрнутый аналитический обзор со ссылками на источники. Список новостей отправляться не будет.
            </div>
          </div>
        </label>
      </div>

      {error && <div style={{ marginBottom: 12, color: 'red', fontSize: 14 }}>{error}</div>}
      {saved && <div style={{ marginBottom: 12, color: 'green', fontSize: 14 }}>✓ Сохранено</div>}

      <button
        onClick={handleSave}
        disabled={saving}
        style={{
          width: '100%',
          padding: '12px',
          background: 'var(--tg-theme-button-color, #2481cc)',
          color: 'var(--tg-theme-button-text-color, #fff)',
          border: 'none',
          borderRadius: 8,
          fontSize: 16,
          cursor: saving ? 'wait' : 'pointer',
          opacity: saving ? 0.6 : 1,
        }}
      >
        {saving ? 'Сохранение...' : 'Сохранить'}
      </button>
    </div>
  )
}
