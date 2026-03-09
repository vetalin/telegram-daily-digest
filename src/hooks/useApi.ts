'use client'

import { useCallback } from 'react'

export function useApi(initData: string | null) {
  const request = useCallback(
    async <T>(path: string, options?: RequestInit): Promise<T> => {
      if (!initData) throw new Error('Not authenticated')

      const res = await fetch(path, {
        ...options,
        headers: {
          'Content-Type': 'application/json',
          'x-telegram-init-data': initData,
          ...options?.headers,
        },
      })

      if (!res.ok) {
        const error = await res.json().catch(() => ({ error: 'Unknown error' })) as { error: string }
        throw new Error(error.error ?? `HTTP ${res.status}`)
      }

      return res.json() as Promise<T>
    },
    [initData],
  )

  return { request }
}
