import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ArrowRight, Bell, BellOff, CalendarClock, RotateCcw, Send } from 'lucide-react'
import { reschedules as reschedulesApi } from '../../lib/api'
import { startOfWeek } from '../../lib/dateRange'
import { dayLabel, formatDayMonthWeekday, formatDayMonth, formatTime, toDateInputValue } from '../../lib/format'
import { levelStyles } from '../../lib/levelColor'
import { dateFromKey, dayKeyOf, weekdayCode } from '../../lib/schedule'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Group, LessonReschedule } from '../../lib/types'
import { Button, Field, Input, Modal } from '../ui'

const REASONS = ['Bayram', 'Tadbir', 'Oʻqituvchi band', 'Imtihon']

function addDays(date: Date, days: number) {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate() + days)
}

function notifiedLabel(result: { notifiedChats: number | null }) {
  if (result.notifiedChats === null) return ''
  return result.notifiedChats > 0 ? ` · ${result.notifiedChats} ta Telegram chatga xabar yuborildi` : ' · Telegramga ulangan oʻquvchi yoʻq'
}

/** The group's next regular lesson days from today, skipping ones already moved. */
function upcomingRegularDays(group: Group, moved: LessonReschedule[], count = 8): string[] {
  const days: string[] = []
  const today = new Date()
  for (let i = 0; days.length < count && i < 60; i++) {
    const day = addDays(today, i)
    const key = toDateInputValue(day)
    if (group.scheduleDays.includes(weekdayCode(day)) && !moved.some((r) => dayKeyOf(r.originalDate) === key)) {
      days.push(key)
    }
  }
  return days
}

/**
 * Moves one lesson of a group to another day and/or time (a holiday, an event),
 * or edits/undoes an existing move -- and tells the group's Telegram chats.
 * `originalDate` and `existing` are day keys ("YYYY-MM-DD") / the move being
 * edited; with neither, the teacher first picks which upcoming lesson to move.
 */
export function RescheduleModal({
  group,
  originalDate: fixedOriginal,
  existing,
  initialNewDate,
  onClose,
}: {
  group: Group
  originalDate?: string
  existing?: LessonReschedule
  initialNewDate?: string
  onClose: () => void
}) {
  const queryClient = useQueryClient()
  const accent = levelStyles(group.level?.color)
  const todayKey = toDateInputValue(new Date())

  const [originalDate, setOriginalDate] = useState(existing ? dayKeyOf(existing.originalDate) : fixedOriginal ?? '')
  const [newDate, setNewDate] = useState(initialNewDate ?? (existing ? dayKeyOf(existing.newDate) : ''))
  const [newTime, setNewTime] = useState(existing?.newTime ?? group.scheduleTime)
  const [reason, setReason] = useState(existing?.reason ?? '')
  const [notify, setNotify] = useState(true)

  // Two weeks starting the Monday of the lesson being moved -- the usual range a lesson moves within.
  const stripStart = useMemo(
    () => startOfWeek(originalDate ? dateFromKey(originalDate) : new Date()),
    [originalDate],
  )
  const strip = useMemo(() => Array.from({ length: 14 }, (_, i) => addDays(stripStart, i)), [stripStart])

  const rangeFrom = toDateInputValue(addDays(new Date(), -7))
  const rangeTo = toDateInputValue(addDays(new Date(), 70))
  const reschedulesQuery = useQuery({
    queryKey: ['reschedules', rangeFrom, rangeTo],
    queryFn: () => reschedulesApi.list(rangeFrom, rangeTo),
  })
  const groupMoves = (reschedulesQuery.data ?? []).filter((r) => r.groupId === group.id)
  const otherMoves = groupMoves.filter((r) => dayKeyOf(r.originalDate) !== originalDate)

  /** Whether the group already meets on `key` -- a lesson can't be moved onto another one. */
  function isBusy(key: string) {
    if (key === originalDate) return false
    const regular =
      group.scheduleDays.includes(weekdayCode(dateFromKey(key))) &&
      !otherMoves.some((r) => dayKeyOf(r.originalDate) === key)
    return regular || otherMoves.some((r) => dayKeyOf(r.newDate) === key)
  }

  const choices = fixedOriginal || existing ? [] : upcomingRegularDays(group, groupMoves)
  const unchanged = newDate === originalDate && newTime === group.scheduleTime
  const canSave = !!originalDate && !!newDate && !!newTime && !unchanged && !isBusy(newDate)

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['reschedules'] })
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      reschedulesApi.save(group.id, { originalDate, newDate, newTime, reason: reason || undefined, notify }),
    onSuccess: (result) => {
      notifySuccess(`Dars koʻchirildi${notifiedLabel(result)}`)
      invalidate()
      onClose()
    },
    onError: (err) => notifyError(err, 'Darsni koʻchirib boʻlmadi'),
  })

  const notifyMutation = useMutation({
    mutationFn: () => reschedulesApi.notify(existing!.id),
    onSuccess: (result) => {
      notifySuccess(`Xabar yuborildi${notifiedLabel(result)}`)
      invalidate()
      onClose()
    },
    onError: (err) => notifyError(err, 'Xabar yuborib boʻlmadi'),
  })

  const cancelMutation = useMutation({
    mutationFn: () => reschedulesApi.cancel(existing!.id, notify),
    onSuccess: (result) => {
      notifySuccess(`Dars asl kuniga qaytarildi${notifiedLabel(result)}`)
      invalidate()
      onClose()
    },
    onError: (err) => notifyError(err, 'Qaytarib boʻlmadi'),
  })

  return (
    <Modal
      size="lg"
      onClose={onClose}
      title={
        <span className="flex items-center gap-2">
          <CalendarClock className="h-5 w-5" style={accent.text} />
          {existing ? 'Koʻchirilgan dars' : 'Darsni koʻchirish'}
          <span className="truncate rounded-full px-2 py-0.5 text-xs font-semibold" style={accent.soft}>
            {group.name}
          </span>
        </span>
      }
    >
      <div className="space-y-5">
        {choices.length > 0 && (
          <div>
            <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Qaysi dars?</span>
            <div className="flex flex-wrap gap-1.5">
              {choices.map((key) => {
                const active = key === originalDate
                return (
                  <button
                    key={key}
                    type="button"
                    onClick={() => {
                      setOriginalDate(key)
                      setNewDate('')
                    }}
                    style={active ? accent.solid : undefined}
                    className={`rounded-lg px-2.5 py-1.5 text-xs font-semibold ${
                      active ? '' : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300'
                    }`}
                  >
                    {dayLabel[weekdayCode(dateFromKey(key))]} {formatDayMonth(dateFromKey(key))}
                  </button>
                )
              })}
            </div>
          </div>
        )}

        {originalDate && (
          <>
            <div>
              <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Yangi kun</span>
              <div className="grid grid-cols-7 gap-1.5">
                {strip.map((day) => {
                  const key = toDateInputValue(day)
                  const busy = isBusy(key)
                  const past = key < todayKey
                  const isOriginal = key === originalDate
                  const selected = key === newDate
                  return (
                    <button
                      key={key}
                      type="button"
                      disabled={busy || past}
                      onClick={() => setNewDate(key)}
                      title={busy ? 'Bu kunda guruhning darsi bor' : isOriginal ? 'Asl kun (faqat vaqtni oʻzgartirish)' : undefined}
                      style={selected ? accent.solid : isOriginal ? { boxShadow: `inset 0 0 0 1.5px ${accent.hex}` } : undefined}
                      className={`flex flex-col items-center rounded-lg py-1.5 text-xs transition-colors disabled:cursor-not-allowed ${
                        selected
                          ? 'shadow-sm'
                          : busy
                            ? 'bg-slate-100 text-slate-300 line-through dark:bg-slate-800/50 dark:text-slate-600'
                            : past
                              ? 'text-slate-300 dark:text-slate-700'
                              : 'bg-slate-50 text-slate-700 hover:bg-slate-100 dark:bg-slate-800 dark:text-slate-200 dark:hover:bg-slate-700'
                      }`}
                    >
                      <span className="text-[10px] font-bold uppercase opacity-70">{dayLabel[weekdayCode(day)]}</span>
                      <span className="text-sm font-bold tabular-nums">{day.getDate()}</span>
                    </button>
                  )
                })}
              </div>
              <div className="mt-2 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
                <span>Boshqa sana:</span>
                <Input
                  type="date"
                  min={todayKey}
                  value={newDate}
                  onChange={(e) => setNewDate(e.target.value)}
                  className="w-40 py-1 text-xs"
                />
                {newDate && isBusy(newDate) && (
                  <span className="text-red-600 dark:text-red-400">Bu kunda guruhning darsi bor</span>
                )}
              </div>
            </div>

            <div className="grid grid-cols-[8rem_1fr] gap-3">
              <Field label="Vaqt">
                <Input type="time" value={newTime} onChange={(e) => setNewTime(e.target.value)} required />
              </Field>
              <Field label="Sabab (ixtiyoriy)">
                <Input value={reason} onChange={(e) => setReason(e.target.value)} placeholder="Masalan: bayram" maxLength={200} />
              </Field>
            </div>
            <div className="-mt-3 flex flex-wrap gap-1.5">
              {REASONS.map((r) => (
                <button
                  key={r}
                  type="button"
                  onClick={() => setReason(r)}
                  className="rounded-full bg-slate-100 px-2.5 py-1 text-xs text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-300 dark:hover:bg-slate-700"
                >
                  {r}
                </button>
              ))}
            </div>

            <div className="flex items-center gap-3 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/60">
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide text-slate-400">Odatiy</p>
                <p className="truncate text-slate-500 line-through dark:text-slate-400">
                  {formatDayMonthWeekday(dateFromKey(originalDate))}, {group.scheduleTime}
                </p>
              </div>
              <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
              <div className="min-w-0 flex-1 text-sm">
                <p className="text-[11px] font-semibold uppercase tracking-wide" style={accent.text}>
                  Yangi
                </p>
                <p className="truncate font-semibold text-slate-900 dark:text-slate-100">
                  {newDate ? `${formatDayMonthWeekday(dateFromKey(newDate))}, ${newTime}` : '—'}
                </p>
              </div>
            </div>
          </>
        )}

        {existing && (
          <div className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 px-3 py-2 text-xs dark:border-slate-700">
            <span className="flex items-center gap-1.5 text-slate-500 dark:text-slate-400">
              {existing.notifiedAt ? (
                <>
                  <Bell className="h-3.5 w-3.5 text-emerald-600" /> Oʻquvchilarga xabar berilgan:{' '}
                  {formatDayMonth(existing.notifiedAt)} {formatTime(existing.notifiedAt)}
                </>
              ) : (
                <>
                  <BellOff className="h-3.5 w-3.5 text-amber-600" /> Oʻquvchilarga hali xabar berilmagan
                </>
              )}
            </span>
            <Button size="sm" variant="secondary" loading={notifyMutation.isPending} onClick={() => notifyMutation.mutate()}>
              <Send className="h-3.5 w-3.5" /> {existing.notifiedAt ? 'Qayta xabar berish' : 'Xabar berish'}
            </Button>
          </div>
        )}

        <label className="flex cursor-pointer items-center gap-2 text-sm text-slate-700 dark:text-slate-300">
          <input
            type="checkbox"
            checked={notify}
            onChange={(e) => setNotify(e.target.checked)}
            className="h-4 w-4 rounded border-slate-300 accent-brand-600"
          />
          Oʻquvchilarga Telegram bot orqali xabar yuborish
        </label>

        <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          {existing ? (
            <Button variant="danger" size="sm" loading={cancelMutation.isPending} onClick={() => cancelMutation.mutate()}>
              <RotateCcw className="h-3.5 w-3.5" /> Asl kuniga qaytarish
            </Button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
            <Button variant="secondary" onClick={onClose}>
              Bekor qilish
            </Button>
            <Button disabled={!canSave} loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
              Saqlash
            </Button>
          </div>
        </div>
      </div>
    </Modal>
  )
}
