import { useMemo, useState, type DragEvent } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useNavigate } from 'react-router-dom'
import { BellOff, CalendarClock, ChevronLeft, ChevronRight, Clock, GripVertical, MoveRight, Users } from 'lucide-react'
import { reschedules as reschedulesApi } from '../../lib/api'
import { startOfWeek } from '../../lib/dateRange'
import { dayLabel, formatDayMonth, toDateInputValue } from '../../lib/format'
import { levelStyles, tint } from '../../lib/levelColor'
import { dateFromKey, dayKeyOf, lessonsOnDay, weekdayCode, type MovedAway, type Occurrence } from '../../lib/schedule'
import { isSameDay } from '../../lib/dateRange'
import type { Group, LessonReschedule } from '../../lib/types'
import { Button, Card } from '../ui'
import { RescheduleModal } from '../schedule/RescheduleModal'

const DRAG_TYPE = 'application/x-lesson'

type DragPayload = { groupId: string; originalDate: string; rescheduleId?: string }
type Editing = { group: Group; originalDate: string; existing?: LessonReschedule; newDate?: string }

function shortDay(iso: string) {
  const date = dateFromKey(dayKeyOf(iso))
  return `${dayLabel[weekdayCode(date)]} ${formatDayMonth(date)}`
}

/**
 * The week at a glance, with every lesson move applied. A lesson is moved by
 * dragging it onto another day (or with its move button); a moved lesson
 * leaves a dashed ghost on its regular day, which opens the move for editing.
 */
export function WeeklyTimetable({ groups }: { groups: Group[] }) {
  const navigate = useNavigate()
  const [weekOffset, setWeekOffset] = useState(0)
  const [editing, setEditing] = useState<Editing | null>(null)
  const [dragOver, setDragOver] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const today = new Date()
  const todayKey = toDateInputValue(today)

  const monday = useMemo(() => {
    const d = startOfWeek(new Date())
    d.setDate(d.getDate() + weekOffset * 7)
    return d
  }, [weekOffset])
  const nextMonday = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + 7)
  const from = toDateInputValue(monday)
  const to = toDateInputValue(nextMonday)

  const reschedulesQuery = useQuery({ queryKey: ['reschedules', from, to], queryFn: () => reschedulesApi.list(from, to) })
  const reschedules = reschedulesQuery.data ?? []

  const days = Array.from({ length: 7 }, (_, i) => {
    const date = new Date(monday.getFullYear(), monday.getMonth(), monday.getDate() + i)
    return { key: toDateInputValue(date), date, ...lessonsOnDay(groups, reschedules, date) }
  })

  const legend = useMemo(() => {
    const seen = new Map<string, { name: string; color: string }>()
    for (const g of groups) if (g.level) seen.set(g.level.id, { name: g.level.name, color: g.level.color })
    return [...seen.values()]
  }, [groups])

  const rangeLabel = `${formatDayMonth(days[0].date)} – ${formatDayMonth(days[6].date)}, ${days[0].date.getFullYear()}`

  /** A lesson can be moved while its regular day (or where it was moved to) is still ahead. */
  function canMove(originalKey: string, reschedule?: LessonReschedule) {
    return originalKey >= todayKey || (!!reschedule && dayKeyOf(reschedule.newDate) >= todayKey)
  }

  function originalKeyOf(occurrence: Occurrence, dayKey: string) {
    return occurrence.reschedule ? dayKeyOf(occurrence.reschedule.originalDate) : dayKey
  }

  function onDrop(e: DragEvent, dayKey: string) {
    e.preventDefault()
    setDragOver(null)
    setDragging(false)
    const raw = e.dataTransfer.getData(DRAG_TYPE)
    if (!raw || dayKey < todayKey) return
    const payload = JSON.parse(raw) as DragPayload
    const group = groups.find((g) => g.id === payload.groupId)
    if (!group) return
    const existing = reschedules.find((r) => r.id === payload.rescheduleId)
    // Dropping a lesson back where it already is changes nothing.
    if (dayKey === (existing ? dayKeyOf(existing.newDate) : payload.originalDate)) return
    setEditing({ group, originalDate: payload.originalDate, existing, newDate: dayKey })
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Haftalik dars jadvali</h2>
          <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
            Darsni boshqa kunga koʻchirish uchun uni sudrab oʻtkazing yoki <CalendarClock className="inline h-3 w-3" /> tugmasini bosing
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Button variant="secondary" onClick={() => setWeekOffset((w) => w - 1)} aria-label="Oldingi hafta">
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[8.5rem] text-center text-xs font-medium text-slate-500 dark:text-slate-400">{rangeLabel}</span>
          <Button variant="secondary" onClick={() => setWeekOffset((w) => w + 1)} aria-label="Keyingi hafta">
            <ChevronRight className="h-4 w-4" />
          </Button>
          {weekOffset !== 0 && (
            <Button variant="ghost" onClick={() => setWeekOffset(0)}>
              Bugun
            </Button>
          )}
        </div>
      </div>

      {/* Seven columns stop being readable on a phone -- there the week scrolls sideways instead. */}
      <div className="-mx-5 overflow-x-auto px-5 pb-1">
        <div className="grid min-w-[52rem] grid-cols-7 gap-2 lg:min-w-0">
          {days.map((day) => {
            const highlighted = isSameDay(day.date, today)
            const past = day.key < todayKey
            const isTarget = dragOver === day.key
            return (
              <div
                key={day.key}
                onDragOver={(e) => {
                  if (past || !e.dataTransfer.types.includes(DRAG_TYPE)) return
                  e.preventDefault()
                  e.dataTransfer.dropEffect = 'move'
                  if (dragOver !== day.key) setDragOver(day.key)
                }}
                onDragLeave={(e) => {
                  if (!e.currentTarget.contains(e.relatedTarget as Node)) setDragOver(null)
                }}
                onDrop={(e) => onDrop(e, day.key)}
                className={`min-w-0 rounded-lg p-2 transition-all ${
                  isTarget
                    ? 'bg-brand-50 ring-2 ring-brand-400 ring-offset-1 dark:bg-brand-500/10 dark:ring-offset-slate-900'
                    : highlighted
                      ? 'bg-brand-50 ring-1 ring-inset ring-brand-200 dark:bg-brand-500/10 dark:ring-brand-500/30'
                      : 'bg-slate-50 dark:bg-slate-800/40'
                } ${dragging && past ? 'opacity-40' : ''}`}
              >
                <p
                  className={`mb-2 text-center text-xs font-semibold ${
                    highlighted ? 'text-brand-700 dark:text-brand-300' : 'text-slate-500 dark:text-slate-400'
                  }`}
                >
                  {dayLabel[weekdayCode(day.date)]} · {formatDayMonth(day.date)}
                </p>
  
                <div className="space-y-1.5">
                  {day.lessons.length === 0 && day.movedAway.length === 0 ? (
                    <p className="py-4 text-center text-xs text-slate-300 dark:text-slate-600">
                      {dragging && !past ? 'Shu yerga tashlang' : '—'}
                    </p>
                  ) : (
                    <>
                      {day.lessons.map((occurrence) => {
                        const originalKey = originalKeyOf(occurrence, day.key)
                        return (
                          <LessonCard
                            key={`${occurrence.group.id}-${originalKey}`}
                            occurrence={occurrence}
                            movable={canMove(originalKey, occurrence.reschedule)}
                            onOpen={() => navigate(`/groups/${occurrence.group.id}?date=${day.key}`)}
                            onMove={() =>
                              setEditing({ group: occurrence.group, originalDate: originalKey, existing: occurrence.reschedule })
                            }
                            onDragStart={(e) => {
                              const payload: DragPayload = {
                                groupId: occurrence.group.id,
                                originalDate: originalKey,
                                rescheduleId: occurrence.reschedule?.id,
                              }
                              e.dataTransfer.setData(DRAG_TYPE, JSON.stringify(payload))
                              e.dataTransfer.effectAllowed = 'move'
                              setDragging(true)
                            }}
                            onDragEnd={() => {
                              setDragging(false)
                              setDragOver(null)
                            }}
                          />
                        )
                      })}
                      {day.movedAway.map((ghost) => (
                        <MovedAwayCard
                          key={ghost.reschedule.id}
                          ghost={ghost}
                          onOpen={() =>
                            setEditing({
                              group: ghost.group,
                              originalDate: dayKeyOf(ghost.reschedule.originalDate),
                              existing: ghost.reschedule,
                            })
                          }
                        />
                      ))}
                    </>
                  )}
                </div>
              </div>
            )
          })}
        </div>
      </div>

      {legend.length > 0 && (
        <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1.5 border-t border-slate-100 pt-3 text-xs text-slate-500 dark:border-slate-800 dark:text-slate-400">
          {legend.map((level) => (
            <span key={level.name} className="flex items-center gap-1.5">
              <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: level.color }} />
              {level.name}
            </span>
          ))}
          <span className="flex items-center gap-1.5">
            <span className="h-2.5 w-4 rounded-sm border border-dashed border-slate-400" /> Koʻchirilgan dars joyi
          </span>
          <span className="flex items-center gap-1.5">
            <BellOff className="h-3 w-3 text-amber-500" /> Oʻquvchilarga xabar berilmagan
          </span>
        </div>
      )}

      {editing && (
        <RescheduleModal
          group={editing.group}
          originalDate={editing.originalDate}
          existing={editing.existing}
          initialNewDate={editing.newDate}
          onClose={() => setEditing(null)}
        />
      )}
    </Card>
  )
}

function LessonCard({
  occurrence,
  movable,
  onOpen,
  onMove,
  onDragStart,
  onDragEnd,
}: {
  occurrence: Occurrence
  movable: boolean
  onOpen: () => void
  onMove: () => void
  onDragStart: (e: DragEvent) => void
  onDragEnd: () => void
}) {
  const { group, time, reschedule } = occurrence
  const accent = levelStyles(group.level?.color)
  return (
    <div
      draggable={movable}
      onDragStart={onDragStart}
      onDragEnd={onDragEnd}
      onDoubleClick={onOpen}
      title="Ushbu kungi darsga oʻtish uchun ikki marta bosing"
      style={{ backgroundColor: tint(accent.hex, 0.08), borderLeftColor: accent.hex }}
      className={`group/card relative rounded-md border-l-[3px] bg-white p-2 text-xs shadow-sm ring-1 ring-inset ring-slate-200 transition-shadow hover:shadow-md dark:bg-slate-900 dark:ring-slate-700 ${
        movable ? 'cursor-grab active:cursor-grabbing' : 'cursor-pointer'
      }`}
    >
      <div className="flex items-center justify-between gap-1">
        <p className="flex items-center gap-1 font-bold" style={accent.text}>
          <Clock className="h-3 w-3" /> {time}
        </p>
        {movable && (
          <span className="flex items-center">
            <button
              onClick={(e) => {
                e.stopPropagation()
                onMove()
              }}
              title="Darsni koʻchirish"
              className="rounded p-0.5 text-slate-400 opacity-0 transition-opacity hover:bg-white hover:text-slate-700 group-hover/card:opacity-100 pointer-coarse:opacity-100 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <CalendarClock className="h-3.5 w-3.5" />
            </button>
            <GripVertical className="h-3.5 w-3.5 text-slate-300 opacity-0 group-hover/card:opacity-100 pointer-coarse:hidden dark:text-slate-600" />
          </span>
        )}
      </div>
      <p className="mt-0.5 truncate font-semibold text-slate-800 dark:text-slate-200">{group.name}</p>
      <p className="truncate text-slate-500 dark:text-slate-400">{group.teacher?.fullName}</p>
      <span className="mt-1 flex items-center gap-1 text-slate-400 dark:text-slate-500">
        <Users className="h-3 w-3" /> {group.enrollments?.length ?? 0}
      </span>
      {reschedule && (
        <span
          className="mt-1 flex items-center gap-1 whitespace-nowrap rounded px-1 py-0.5 text-[10px] font-semibold"
          style={accent.soft}
          title={reschedule.reason ?? undefined}
        >
          {!reschedule.notifiedAt && <BellOff className="h-2.5 w-2.5 shrink-0 text-amber-500" />}
          <MoveRight className="h-2.5 w-2.5 shrink-0" />
          <span className="truncate">{shortDay(reschedule.originalDate)} dan</span>
        </span>
      )}
    </div>
  )
}

function MovedAwayCard({ ghost, onOpen }: { ghost: MovedAway; onOpen: () => void }) {
  const accent = levelStyles(ghost.group.level?.color)
  return (
    <button
      onClick={onOpen}
      style={{ borderColor: tint(accent.hex, 0.6) }}
      className="block w-full rounded-md border border-dashed p-2 text-left text-xs opacity-80 transition-opacity hover:opacity-100"
      title={ghost.reschedule.reason ?? 'Koʻchirilgan dars'}
    >
      <p className="truncate font-medium text-slate-400 line-through">
        {ghost.group.scheduleTime} · {ghost.group.name}
      </p>
      <p className="mt-0.5 flex items-center gap-1 font-semibold" style={accent.text}>
        <MoveRight className="h-3 w-3" /> {shortDay(ghost.reschedule.newDate)}, {ghost.reschedule.newTime}
      </p>
      {ghost.reschedule.reason && <p className="truncate text-slate-400">{ghost.reschedule.reason}</p>}
    </button>
  )
}
