/**
 * The slice of Telegram's Mini App SDK (telegram-web-app.js) this app uses.
 * `initData` is the raw signed string the server verifies; `initDataUnsafe`
 * is deliberately not typed here so nothing is tempted to trust it.
 */
type TelegramWebApp = {
  initData: string
  colorScheme: 'light' | 'dark'
  ready: () => void
  expand: () => void
  close: () => void
  setHeaderColor?: (color: string) => void
  setBackgroundColor?: (color: string) => void
  /** Bot API 7.10+; older Telegram clients don't have it. */
  setBottomBarColor?: (color: string) => void
  BackButton: { show: () => void; hide: () => void; onClick: (cb: () => void) => void; offClick: (cb: () => void) => void }
  HapticFeedback?: { impactOccurred: (style: 'light' | 'medium') => void; notificationOccurred: (type: 'success' | 'error') => void }
}

declare global {
  interface Window {
    Telegram?: { WebApp?: TelegramWebApp }
  }
}

const SDK_URL = 'https://telegram.org/js/telegram-web-app.js'

/** Loads Telegram's SDK (only for the Mini App -- the admin panel never pulls it in). */
export function loadTelegramSdk(): Promise<void> {
  if (window.Telegram?.WebApp) return Promise.resolve()
  return new Promise((resolve) => {
    const script = document.createElement('script')
    script.src = SDK_URL
    script.onload = () => resolve()
    // Opened outside Telegram or offline: the app still renders its "open in Telegram" screen.
    script.onerror = () => resolve()
    document.head.appendChild(script)
  })
}

export function webApp(): TelegramWebApp | undefined {
  return window.Telegram?.WebApp
}

/** The signed launch data, or '' when not opened from Telegram (e.g. a plain browser tab). */
export function initData(): string {
  return webApp()?.initData ?? ''
}

export function haptic(kind: 'tap' | 'success' | 'error') {
  const h = webApp()?.HapticFeedback
  if (!h) return
  if (kind === 'tap') h.impactOccurred('light')
  else h.notificationOccurred(kind)
}
