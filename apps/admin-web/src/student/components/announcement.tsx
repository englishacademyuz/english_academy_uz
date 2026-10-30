import { useEffect, useState } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, ImageIcon, Loader2 } from 'lucide-react'
import { miniApi } from '../api'
import { MONTHS, WEEK_SHORT, weekdayDate } from '../format'
import type { MiniAnnouncement } from '../types'

/**
 * News, events and organizational notices, each in its own look: news is a white card with a
 * blue edge (picture on top), an event a festive grape card with a calendar tile, and a notice
 * a warm peach card with a megaphone -- and the amount to bring, when something is collected.
 */

export const ANNOUNCEMENT_LABEL: Record<MiniAnnouncement['kind'], string> = {
  NEWS: '📰 Yangilik',
  EVENT: '🎉 Tadbir',
  ORGANIZATIONAL: '📣 Tashkiliy eʼlon',
}

const DAY_MS = 24 * 60 * 60 * 1000

/** Calendar days from `now` to `date`, in local time -- 0 today, 1 tomorrow. */
function daysUntil(date: Date, now: Date) {
  const start = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  return Math.round((start(date) - start(now)) / DAY_MS)
}

/** "Bugun" / "Kecha" / "Chorshanba, 30-oktabr" -- when it was posted. */
export function postedLabel(createdAt: string, now = new Date()) {
  const days = daysUntil(new Date(createdAt), now)
  return days === 0 ? 'Bugun' : days === -1 ? 'Kecha' : weekdayDate(new Date(createdAt))
}

/** "Bugun" / "Ertaga" / "3 kundan soʻng" / "Oʻtdi" -- how soon an event is. */
export function eventCountdown(eventAt: string, now = new Date()) {
  const days = daysUntil(new Date(eventAt), now)
  if (days < 0) return 'Oʻtdi'
  return days === 0 ? 'Bugun' : days === 1 ? 'Ertaga' : `${days} kundan soʻng`
}

const pad = (n: number) => String(n).padStart(2, '0')
export const clockOf = (date: Date) => `${pad(date.getHours())}:${pad(date.getMinutes())}`

/** Posted in the last two days -- worth a "Yangi" sticker. */
const isFresh = (createdAt: string) => Date.now() - new Date(createdAt).getTime() < 2 * DAY_MS

function FreshSticker({ createdAt }: { createdAt: string }) {
  if (!isFresh(createdAt)) return null
  return <span className="rounded-full bg-tg-sun px-2.5 py-0.5 text-xs font-extrabold text-tg-ink">Yangi</span>
}

/** The announcement's picture -- fetched with the Telegram auth header, then shown from memory. */
export function AnnouncementPicture({ id, className }: { id: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    miniApi
      .announcementImageUrl(id)
      .then((url) => live && setSrc(url))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [id])
  if (src) return <img src={src} alt="" className={className} draggable={false} />
  return (
    <span className={`flex items-center justify-center bg-tg-sand text-tg-faint ${className}`}>
      {failed ? <ImageIcon className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
    </span>
  )
}

/** A tear-off calendar page: weekday, the day's number, the month. */
export function EventDateTile({ eventAt }: { eventAt: string }) {
  const date = new Date(eventAt)
  return (
    <span className="flex w-[72px] shrink-0 flex-col items-center overflow-hidden rounded-[18px] bg-white text-tg-grape">
      <span className="w-full bg-tg-sun py-0.5 text-center text-xs font-extrabold uppercase text-tg-ink">
        {WEEK_SHORT[(date.getDay() + 6) % 7]}
      </span>
      <span className="font-tg-display text-[34px] font-bold leading-[1.1] tabular-nums">{date.getDate()}</span>
      <span className="pb-1.5 text-xs font-extrabold">{MONTHS[date.getMonth()]}</span>
    </span>
  )
}

/** One announcement as a home-screen / list card that opens it in full. */
export function AnnouncementCard({ announcement: a }: { announcement: MiniAnnouncement }) {
  const to = `/student/news/${a.id}`

  if (a.kind === 'EVENT' && a.eventAt) {
    const at = new Date(a.eventAt)
    return (
      <Link to={to} className="flex flex-col gap-3.5 rounded-[28px] bg-tg-grape p-[18px] text-white active:scale-[0.99]">
        <div className="flex items-center gap-2">
          <span className="text-sm font-extrabold uppercase text-tg-grape-soft">{ANNOUNCEMENT_LABEL.EVENT}</span>
          <FreshSticker createdAt={a.createdAt} />
          <span className="ml-auto rounded-full bg-tg-grape-2 px-2.5 py-0.5 text-xs font-extrabold">{eventCountdown(a.eventAt)}</span>
        </div>
        <div className="flex items-center gap-4">
          <EventDateTile eventAt={a.eventAt} />
          <div className="flex min-w-0 grow flex-col gap-1">
            <span className="line-clamp-2 font-tg-display text-[22px] font-semibold leading-[1.15]">{a.title}</span>
            <span className="text-sm font-bold text-tg-grape-soft">🕒 soat {clockOf(at)}</span>
          </div>
          <ChevronRight className="h-6 w-6 shrink-0" strokeWidth={2.5} />
        </div>
        {a.image && <AnnouncementPicture id={a.id} className="aspect-[16/9] w-full rounded-[20px] object-cover" />}
        <p className="line-clamp-2 whitespace-pre-line text-[15px] font-bold leading-snug text-white/90">{a.body}</p>
      </Link>
    )
  }

  if (a.kind === 'ORGANIZATIONAL') {
    return (
      <Link
        to={to}
        className="flex flex-col gap-3.5 rounded-[28px] border-[3px] border-tg-orange bg-tg-peach p-[18px] active:scale-[0.99]"
      >
        <div className="flex items-center gap-4">
          <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-tg-orange text-3xl" aria-hidden>
            📣
          </span>
          <div className="flex min-w-0 grow flex-col gap-0.5">
            <span className="flex items-center gap-2">
              <span className="text-sm font-extrabold uppercase text-tg-rust">Tashkiliy eʼlon</span>
              <FreshSticker createdAt={a.createdAt} />
            </span>
            <span className="line-clamp-2 font-tg-display text-[22px] font-semibold leading-[1.15]">{a.title}</span>
          </div>
        </div>
        {a.image && <AnnouncementPicture id={a.id} className="aspect-[16/9] w-full rounded-[20px] object-cover" />}
        <p className="line-clamp-3 whitespace-pre-line text-[15px] font-bold leading-snug text-tg-body">{a.body}</p>
        {a.amount != null && <AmountRow amount={a.amount} />}
      </Link>
    )
  }

  return (
    <Link to={to} className="flex flex-col overflow-hidden rounded-[28px] border-[3px] border-tg-blue-soft bg-white active:scale-[0.99]">
      {a.image && <AnnouncementPicture id={a.id} className="aspect-[16/9] w-full object-cover" />}
      <div className="flex flex-col gap-1.5 p-[18px]">
        <span className="flex items-center gap-2">
          <span className="text-sm font-extrabold uppercase text-tg-blue-dark">{ANNOUNCEMENT_LABEL.NEWS}</span>
          <FreshSticker createdAt={a.createdAt} />
        </span>
        <span className="line-clamp-2 font-tg-display text-[22px] font-semibold leading-[1.15]">{a.title}</span>
        <p className="line-clamp-3 whitespace-pre-line text-[15px] font-bold leading-snug text-tg-body">{a.body}</p>
        <span className="mt-1 text-[13px] font-bold text-tg-muted">
          {a.authorName} · {postedLabel(a.createdAt)}
        </span>
      </div>
    </Link>
  )
}

/** "💰 Har bir oʻquvchidan · 20 000 soʻm" -- what a collection asks of each family. */
export function AmountRow({ amount }: { amount: number }) {
  return (
    <div className="flex items-center justify-between gap-3 rounded-[18px] bg-white px-4 py-3">
      <span className="text-[15px] font-extrabold text-tg-rust">💰 Har bir oʻquvchidan</span>
      <span className="font-tg-display text-[22px] font-bold leading-none tabular-nums">
        {amount.toLocaleString('ru-RU')} <span className="font-tg-body text-sm font-extrabold">soʻm</span>
      </span>
    </div>
  )
}
