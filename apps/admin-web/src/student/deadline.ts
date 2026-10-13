import { useEffect, useState } from 'react'
import { weekdayDate } from './format'

/**
 * How close a deadline is -- what decides how loudly the Mini App shows it:
 * `hot` under three hours left, `soon` under a day, `later` beyond that, `overdue` once passed.
 */
export type Urgency = 'later' | 'soon' | 'hot' | 'overdue'

const MINUTE = 60_000
const HOUR = 60 * MINUTE

export function urgencyOf(due: Date, now: Date): Urgency {
  const left = due.getTime() - now.getTime()
  if (left < 0) return 'overdue'
  if (left < 3 * HOUR) return 'hot'
  if (left < 24 * HOUR) return 'soon'
  return 'later'
}

/** The deadline a homework card counts down to, and which picture task it belongs to (null: the written homework). */
export type HomeworkDeadline = { at: Date; task: string | null }

/**
 * When a homework is due: the soonest deadline still ahead among the written homework's and its
 * picture tasks' -- or, once all have passed, the last one. Tasks in `done` (handed in, keyed
 * 'written' or by picture id) don't count. Null when nothing left has a deadline.
 */
export function homeworkDeadline(
  dueDate: string | null,
  images: Array<{ id: string; title: string | null; dueDate: string | null }>,
  now: Date,
  done: string[] = [],
): HomeworkDeadline | null {
  const deadlines: HomeworkDeadline[] = [
    ...(dueDate && !done.includes('written') ? [{ at: new Date(dueDate), task: null }] : []),
    ...images.flatMap((image, i) =>
      image.dueDate && !done.includes(image.id) ? [{ at: new Date(image.dueDate), task: image.title?.trim() || `${i + 1}-vazifa` }] : [],
    ),
  ]
  if (deadlines.length === 0) return null
  const ahead = deadlines.filter((d) => d.at.getTime() >= now.getTime()).sort((a, b) => a.at.getTime() - b.at.getTime())
  return ahead[0] ?? deadlines.reduce((a, b) => (b.at > a.at ? b : a))
}

const pad = (n: number) => String(n).padStart(2, '0')
const clock = (d: Date) => `${pad(d.getHours())}:${pad(d.getMinutes())}`

/** "Bugun 18:00 gacha", "Ertaga 09:30 gacha", "Chorshanba, 8-oktabr, 18:00 gacha" -- in the viewer's time. */
export function deadlineLabel(due: Date, now: Date): string {
  const day = (d: Date) => new Date(d.getFullYear(), d.getMonth(), d.getDate()).getTime()
  const days = Math.round((day(due) - day(now)) / (24 * HOUR))
  const when = days === 0 ? 'Bugun' : days === 1 ? 'Ertaga' : `${weekdayDate(due)},`
  return `${when} ${clock(due)} gacha`
}

/** "2 soat 15 daqiqa", "45 daqiqa", "3 kun 4 soat" -- what's left until `due`. */
export function timeLeft(due: Date, now: Date): string {
  const minutes = Math.max(0, Math.floor((due.getTime() - now.getTime()) / MINUTE))
  if (minutes < 1) return '1 daqiqadan kam'
  const days = Math.floor(minutes / (24 * 60))
  const hours = Math.floor((minutes % (24 * 60)) / 60)
  const mins = minutes % 60
  if (days > 0) return hours > 0 ? `${days} kun ${hours} soat` : `${days} kun`
  if (hours > 0) return mins > 0 ? `${hours} soat ${mins} daqiqa` : `${hours} soat`
  return `${mins} daqiqa`
}

/** The current time, refreshed every `everyMs` -- enough for a countdown in minutes. */
export function useNow(everyMs = 15_000) {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), everyMs)
    return () => clearInterval(timer)
  }, [everyMs])
  return now
}
