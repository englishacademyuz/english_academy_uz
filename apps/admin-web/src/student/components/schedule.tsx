import { dateFromKey, dayKeyOf } from '../../lib/schedule'
import { toDateInputValue } from '../../lib/format'
import { WEEK_SHORT, WEEKDAYS, weekdayDate } from '../format'
import type { GroupSummary, MiniScheduleChange } from '../types'

const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']
const MONDAY_FIRST = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

/** How long after its start a lesson still counts as "happening now". */
const LESSON_MINUTES = 90

/** The Monday of `date`'s week, at local midnight. */
export function weekStart(date: Date): Date {
  const d = new Date(date.getFullYear(), date.getMonth(), date.getDate())
  d.setDate(d.getDate() - ((d.getDay() + 6) % 7))
  return d
}

export function addDays(date: Date, days: number): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

export const sameDay = (a: Date, b: Date) => toDateInputValue(a) === toDateInputValue(b)

/**
 * The group's lesson on `day`, if any: the regular weekly slot, unless it was
 * moved away -- or a lesson moved onto this day. `moved` carries the change.
 */
export function lessonOn(group: GroupSummary, changes: MiniScheduleChange[], day: Date) {
  const key = toDateInputValue(day)
  const movedHere = changes.find((c) => dayKeyOf(c.newDate) === key)
  if (movedHere) return { time: movedHere.newTime, moved: movedHere }
  const movedAway = changes.some((c) => dayKeyOf(c.originalDate) === key)
  if (!movedAway && group.scheduleDays.includes(WEEKDAY_CODES[day.getDay()])) return { time: group.scheduleTime, moved: null }
  return null
}

function atTime(day: Date, time: string): Date {
  const [h, m] = time.split(':').map(Number)
  return new Date(day.getFullYear(), day.getMonth(), day.getDate(), h, m)
}

/** The next lesson that hasn't finished yet (the one in progress counts), within the next two weeks. */
export function nextLesson(group: GroupSummary, changes: MiniScheduleChange[], now = new Date(), fromDay = now) {
  for (let i = 0; i < 15; i++) {
    const day = addDays(fromDay, i)
    const lesson = lessonOn(group, changes, day)
    if (!lesson) continue
    const start = atTime(day, lesson.time)
    if (start.getTime() + LESSON_MINUTES * 60_000 > now.getTime()) return { start, time: lesson.time, moved: lesson.moved }
  }
  return null
}

/** "Bugun" / "Ertaga" / the weekday -- how a child says when the next lesson is. */
export function relativeDay(date: Date, now = new Date()): string {
  if (sameDay(date, now)) return 'Bugun'
  if (sameDay(date, addDays(now, 1))) return 'Ertaga'
  return WEEKDAYS[date.getDay()]
}

/** This week as seven tiles: lesson days in blue, today ringed in orange. */
export function WeekStrip({ group, changes }: { group: GroupSummary; changes: MiniScheduleChange[] }) {
  const today = new Date()
  const monday = weekStart(today)
  return (
    <div className="flex flex-col gap-3">
      <div className="grid grid-cols-7 gap-1.5">
        {WEEK_SHORT.map((label, i) => {
          const day = addDays(monday, i)
          const lesson = !!lessonOn(group, changes, day)
          const isToday = sameDay(day, today)
          return (
            <div
              key={label}
              className={`flex flex-col items-center gap-0.5 rounded-[14px] py-2 ${
                lesson ? 'bg-tg-blue text-white' : 'bg-tg-sand text-tg-muted'
              } ${isToday ? 'outline-[3px] outline-offset-2 outline-tg-orange outline-solid' : ''}`}
            >
              <span className="text-[13px] font-extrabold">{label}</span>
              <span className="font-tg-display text-base font-extrabold">{day.getDate()}</span>
            </div>
          )
        })}
      </div>
      <div className="flex gap-3.5 text-[13px] font-bold text-tg-body">
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-[5px] bg-tg-blue" />
          Dars bor
        </span>
        <span className="flex items-center gap-1.5">
          <span className="h-3.5 w-3.5 rounded-[5px] border-[3px] border-tg-orange" />
          Bugun
        </span>
      </div>
    </div>
  )
}

/** The group's regular days as seven labels, Monday first -- no dates. */
export function WeekdayRow({ days }: { days: string[] }) {
  return (
    <div className="grid grid-cols-7 gap-[5px] text-center">
      {MONDAY_FIRST.map((code, i) => (
        <span
          key={code}
          className={`rounded-xl py-2 text-[13px] font-extrabold ${
            days.includes(code) ? 'bg-tg-blue text-white' : 'bg-tg-sand text-tg-muted'
          }`}
        >
          {WEEK_SHORT[i]}
        </span>
      ))}
    </div>
  )
}

/** "Your lesson moved" cards -- the regular day struck through, the new day and time in bold. */
export function ScheduleChanges({ changes }: { changes: MiniScheduleChange[] }) {
  if (changes.length === 0) return null
  return (
    <div className="flex flex-col gap-2.5">
      {changes.map((c) => (
        <div key={c.id} className="flex flex-col gap-1 rounded-[22px] border-[3px] border-tg-orange bg-tg-peach p-4">
          <span className="text-[13px] font-extrabold uppercase text-tg-rust">📅 Dars vaqti oʻzgardi</span>
          <span className="text-[15px] font-bold text-tg-muted line-through">
            {weekdayDate(dateFromKey(dayKeyOf(c.originalDate)))}, {c.regularTime}
          </span>
          <span className="text-[17px] font-extrabold">
            → {weekdayDate(dateFromKey(dayKeyOf(c.newDate)))}, {c.newTime}
          </span>
          {c.reason && <span className="text-sm font-bold text-tg-body">Sabab: {c.reason}</span>}
        </div>
      ))}
    </div>
  )
}
