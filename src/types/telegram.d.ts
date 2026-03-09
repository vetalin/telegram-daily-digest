interface TelegramWebAppUser {
  id: number
  is_bot?: boolean
  first_name: string
  last_name?: string
  username?: string
  language_code?: string
  is_premium?: boolean
  photo_url?: string
}

interface TelegramWebAppInitData {
  query_id?: string
  user?: TelegramWebAppUser
  receiver?: TelegramWebAppUser
  chat?: object
  start_param?: string
  auth_date: number
  hash: string
}

interface TelegramWebAppThemeParams {
  bg_color?: string
  text_color?: string
  hint_color?: string
  link_color?: string
  button_color?: string
  button_text_color?: string
  secondary_bg_color?: string
}

interface TelegramWebApp {
  initData: string
  initDataUnsafe: TelegramWebAppInitData
  version: string
  platform: string
  colorScheme: 'light' | 'dark'
  themeParams: TelegramWebAppThemeParams
  isExpanded: boolean
  viewportHeight: number
  viewportStableHeight: number
  isClosingConfirmationEnabled: boolean

  ready(): void
  expand(): void
  close(): void
  showAlert(message: string, callback?: () => void): void
  showConfirm(message: string, callback?: (ok: boolean) => void): void
  showPopup(params: object, callback?: (buttonId: string) => void): void
  enableClosingConfirmation(): void
  disableClosingConfirmation(): void
  setHeaderColor(color: string): void
  setBackgroundColor(color: string): void
  onEvent(eventType: string, eventHandler: () => void): void
  offEvent(eventType: string, eventHandler: () => void): void
  sendData(data: string): void
  openLink(url: string, options?: { try_instant_view?: boolean }): void
  openTelegramLink(url: string): void
}

interface Window {
  Telegram?: {
    WebApp: TelegramWebApp
  }
}
