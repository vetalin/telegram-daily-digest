import type { Metadata } from 'next'
import Script from 'next/script'

export const metadata: Metadata = {
  title: 'Telegram Daily Digest',
  description: 'Персональный дайджест Telegram-каналов',
}

export default function MiniAppLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <head>
        <meta name="viewport" content="width=device-width, initial-scale=1, maximum-scale=1" />
        <Script src="https://telegram.org/js/telegram-web-app.js" strategy="beforeInteractive" />
      </head>
      <body style={{ margin: 0, fontFamily: 'system-ui, sans-serif', backgroundColor: 'var(--tg-theme-bg-color, #fff)', color: 'var(--tg-theme-text-color, #000)' }}>
        {children}
      </body>
    </html>
  )
}
