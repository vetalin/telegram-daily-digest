'use client'

import { useEffect, useState } from 'react'

export function useTelegramAuth() {
  const [initData, setInitData] = useState<string | null>(null)
  const [isReady, setIsReady] = useState(false)

  useEffect(() => {
    const tg = window.Telegram?.WebApp
    if (tg) {
      tg.ready()
      tg.expand()
      setInitData(tg.initData || null)
    }
    setIsReady(true)
  }, [])

  return { initData, isReady }
}
