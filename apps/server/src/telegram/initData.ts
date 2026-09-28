import { createHmac, timingSafeEqual } from 'node:crypto'

// A Mini App session older than this must be reopened -- limits how long a
// leaked initData string stays usable.
const MAX_AGE_SECONDS = 24 * 60 * 60

export type TelegramInitUser = { id: number; first_name?: string; last_name?: string; username?: string }

export type VerifiedInitData = { user: TelegramInitUser; authDate: Date; startParam?: string }

function sign(dataCheckString: string, botToken: string): Buffer {
  const secret = createHmac('sha256', 'WebAppData').update(botToken).digest()
  return createHmac('sha256', secret).update(dataCheckString).digest()
}

function dataCheckString(params: URLSearchParams, exclude: string[]): string {
  return [...params.entries()]
    .filter(([key]) => !exclude.includes(key))
    .map(([key, value]) => `${key}=${value}`)
    .sort()
    .join('\n')
}

/**
 * Validates a Telegram Mini App `initData` string server-side (the client's
 * `initDataUnsafe` is never trusted): the HMAC-SHA-256 `hash`, keyed by the
 * bot token, must match, and `auth_date` must be recent. Returns null when
 * the data is forged, stale, or malformed.
 */
export function verifyTelegramInitData(
  initData: string,
  botToken: string,
  now = new Date(),
): VerifiedInitData | null {
  const params = new URLSearchParams(initData)
  const hash = params.get('hash')
  if (!hash || !/^[0-9a-f]{64}$/i.test(hash)) return null
  const received = Buffer.from(hash, 'hex')

  // Newer clients also send an Ed25519 `signature`; whether it belongs in the
  // HMAC's check string differs between doc revisions, so both forms are accepted.
  // Either way the HMAC can only be produced with the bot token.
  const valid = [['hash', 'signature'], ['hash']].some((exclude) =>
    timingSafeEqual(sign(dataCheckString(params, exclude), botToken), received),
  )
  if (!valid) return null

  const authDate = Number(params.get('auth_date'))
  if (!Number.isFinite(authDate) || authDate <= 0) return null
  const ageSeconds = now.getTime() / 1000 - authDate
  if (ageSeconds > MAX_AGE_SECONDS || ageSeconds < -60) return null

  let user: TelegramInitUser
  try {
    user = JSON.parse(params.get('user') ?? '')
  } catch {
    return null
  }
  if (!user || typeof user.id !== 'number') return null

  return { user, authDate: new Date(authDate * 1000), startParam: params.get('start_param') ?? undefined }
}

/** Builds a correctly signed initData string -- for tests only. */
export function signTelegramInitData(fields: Record<string, string>, botToken: string): string {
  const params = new URLSearchParams(fields)
  params.set('hash', sign(dataCheckString(params, ['hash', 'signature']), botToken).toString('hex'))
  return params.toString()
}
