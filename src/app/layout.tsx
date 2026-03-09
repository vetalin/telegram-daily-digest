import type { Metadata } from 'next'

export const metadata: Metadata = {
  title: 'Telegram Daily Digest',
  description: 'Персональный дайджест Telegram-каналов',
}

export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ru">
      <body>{children}</body>
    </html>
  )
}
