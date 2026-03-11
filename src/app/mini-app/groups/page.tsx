'use client'

import { useEffect, useState } from 'react'
import Link from 'next/link'
import { useRouter } from 'next/navigation'
import { useTelegramAuth } from '@/hooks/useTelegramAuth'
import { useApi } from '@/hooks/useApi'
import type { GroupResponse } from '@/types/api'

export default function GroupsPage() {
  const { initData, isReady } = useTelegramAuth()
  const { request } = useApi(initData)
  const router = useRouter()
  const [groups, setGroups] = useState<GroupResponse[]>([])
  const [loading, setLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)
  const [creating, setCreating] = useState(false)
  const [newName, setNewName] = useState('')
  const [showForm, setShowForm] = useState(false)

  useEffect(() => {
    if (!isReady || !initData) return
    request<GroupResponse[]>('/api/groups')
      .then(setGroups)
      .catch((e: Error) => setError(e.message))
      .finally(() => setLoading(false))
  }, [isReady, initData, request])

  async function handleCreate() {
    if (!newName.trim()) return
    setCreating(true)
    try {
      const group = await request<GroupResponse>('/api/groups', {
        method: 'POST',
        body: JSON.stringify({ name: newName.trim() }),
      })
      setGroups((prev) => [...prev, group])
      setNewName('')
      setShowForm(false)
      router.push(`/mini-app/groups/${group.id}`)
    } catch (e: unknown) {
      alert((e as Error).message)
    } finally {
      setCreating(false)
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
      <div style={{ display: 'flex', alignItems: 'center', marginBottom: 16, gap: 8 }}>
        <Link href="/mini-app" style={{ color: 'var(--tg-theme-link-color, #2481cc)', textDecoration: 'none', fontSize: 14 }}>
          ← Назад
        </Link>
        <h1 style={{ margin: 0, fontSize: 20, flex: 1 }}>Группы каналов</h1>
      </div>

      <p style={{ fontSize: 13, opacity: 0.6, marginTop: 0, marginBottom: 16 }}>
        Разбивайте каналы на группы, чтобы получать отдельные дайджесты для каждой темы.
      </p>

      {groups.length === 0 && !showForm ? (
        <div style={{ textAlign: 'center', padding: 40, opacity: 0.6 }}>
          <p>У вас пока нет групп.</p>
        </div>
      ) : (
        <ul style={{ listStyle: 'none', margin: 0, padding: 0, marginBottom: 16 }}>
          {groups.map((g) => (
            <li key={g.id}>
              <Link
                href={`/mini-app/groups/${g.id}`}
                style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', padding: '12px 0', borderBottom: '1px solid var(--tg-theme-hint-color, #ccc)', textDecoration: 'none', color: 'inherit' }}
              >
                <div>
                  <div style={{ fontWeight: 600 }}>📂 {g.name}</div>
                  <div style={{ fontSize: 12, opacity: 0.6 }}>{g.channelCount} канал{g.channelCount === 1 ? '' : g.channelCount < 5 ? 'а' : 'ов'}</div>
                </div>
                <span style={{ opacity: 0.4, fontSize: 18 }}>›</span>
              </Link>
            </li>
          ))}
        </ul>
      )}

      {showForm ? (
        <div style={{ marginBottom: 16 }}>
          <input
            type="text"
            placeholder="Название группы (напр. «Инвестиции»)"
            value={newName}
            onChange={(e) => setNewName(e.target.value)}
            onKeyDown={(e) => e.key === 'Enter' && handleCreate()}
            autoFocus
            style={{ width: '100%', padding: '10px 12px', borderRadius: 8, border: '1px solid var(--tg-theme-hint-color, #ccc)', fontSize: 15, boxSizing: 'border-box', marginBottom: 8, background: 'var(--tg-theme-bg-color, #fff)', color: 'var(--tg-theme-text-color, #000)' }}
          />
          <div style={{ display: 'flex', gap: 8 }}>
            <button
              onClick={handleCreate}
              disabled={creating || !newName.trim()}
              style={{ flex: 1, padding: '10px', background: 'var(--tg-theme-button-color, #2481cc)', color: 'var(--tg-theme-button-text-color, #fff)', border: 'none', borderRadius: 8, fontSize: 15, cursor: creating || !newName.trim() ? 'default' : 'pointer', opacity: creating || !newName.trim() ? 0.6 : 1 }}
            >
              {creating ? 'Создаём...' : 'Создать'}
            </button>
            <button
              onClick={() => { setShowForm(false); setNewName('') }}
              style={{ padding: '10px 16px', background: 'var(--tg-theme-secondary-bg-color, #f0f0f0)', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer', color: 'inherit' }}
            >
              Отмена
            </button>
          </div>
        </div>
      ) : (
        <button
          onClick={() => setShowForm(true)}
          style={{ width: '100%', padding: '12px', background: 'var(--tg-theme-button-color, #2481cc)', color: 'var(--tg-theme-button-text-color, #fff)', border: 'none', borderRadius: 8, fontSize: 15, cursor: 'pointer' }}
        >
          + Создать группу
        </button>
      )}
    </div>
  )
}
