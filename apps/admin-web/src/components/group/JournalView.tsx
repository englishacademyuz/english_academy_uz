import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, ChevronLeft, ChevronRight, Clock, MinusCircle, UserPlus, XCircle } from 'lucide-react'
import { sessions as sessionsApi } from '../../lib/api'
import {
  attendanceStatusLabel,
  attendanceStatusShortLabel,
  attendanceStatusTone,
  formatMonthYear,
  todayInputValue,
} from '../../lib/format'
import { isSameDay } from '../../lib/dateRange'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { AttendanceStatus, Group } from '../../lib/types'
import { Badge, Button, Card, EmptyState } from '../ui'
import { StudentsMatrixTable, type MatrixColumn } from './StudentsMatrixTable'
import { AddStudentModal } from './AddStudentModal'

const STATUS_ICONS: Record<AttendanceStatus, typeof CheckCircle2> = {
  PRESENT: CheckCircle2,
  LATE: Clock,
  ABSENT: XCircle,
  EXCUSED: MinusCircle,
}
const STATUS_ORDER: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED']

function startOfMonth(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), 1)
}

export function JournalView({ group }: { group: Group }) {
  const now = new Date()
  const [monthAnchor, setMonthAnchor] = useState(() => startOfMonth(now))
  const [selectedDate, setSelectedDate] = useState(now)
  const [showAddStudent, setShowAddStudent] = useState(false)
  const queryClient = useQueryClient()

  const roster = group.enrollments ?? []

  const sessionsQuery = useQuery({
    queryKey: ['group-sessions', group.id, 'all'],
    queryFn: () => sessionsApi.listForGroup(group.id),
  })
  const sessions = sessionsQuery.data ?? []

  const isCurrentMonth = monthAnchor.getFullYear() === now.getFullYear() && monthAnchor.getMonth() === now.getMonth()

  // Only past/today lesson days show up as pills -- never the future, and never a day
  // outside the month currently being viewed.
  const pillDates: Date[] = []
  const seenKeys = new Set<string>()
  for (const s of sessions) {
    const d = new Date(s.date)
    if (d.getFullYear() !== monthAnchor.getFullYear() || d.getMonth() !== monthAnchor.getMonth()) continue
    if (d > now) continue
    const key = d.toDateString()
    if (!seenKeys.has(key)) {
      seenKeys.add(key)
      pillDates.push(d)
    }
  }
  if (isCurrentMonth && !seenKeys.has(now.toDateString())) {
    pillDates.push(now)
  }
  pillDates.sort((a, b) => a.getTime() - b.getTime())

  const selectedSession = sessions.find((s) => isSameDay(new Date(s.date), selectedDate))
  const isSelectedToday = isSameDay(selectedDate, now)
  const isBackToToday = isCurrentMonth && isSelectedToday

  const [pending, setPending] = useState<Record<string, AttendanceStatus>>({})
  useEffect(() => {
    const map: Record<string, AttendanceStatus> = {}
    for (const a of selectedSession?.attendances ?? []) map[a.studentId] = a.status
    setPending(map)
  }, [selectedDate.getTime(), selectedSession?.id])

  const saveMutation = useMutation({
    mutationFn: () =>
      sessionsApi.record(group.id, {
        date: todayInputValue(),
        attendance: Object.entries(pending).map(([studentId, status]) => ({ studentId, status })),
      }),
    onSuccess: () => {
      notifySuccess('Davomat saqlandi')
      queryClient.invalidateQueries({ queryKey: ['group-sessions', group.id] })
    },
    onError: (err) => notifyError(err, 'Davomatni saqlab boʻlmadi'),
  })

  function goToToday() {
    setMonthAnchor(startOfMonth(now))
    setSelectedDate(now)
  }

  const columns: MatrixColumn[] = STATUS_ORDER.map((status) => ({
    key: status,
    header: attendanceStatusLabel[status],
    render: (studentId) => {
      if (!isSelectedToday) {
        const recordedStatus = selectedSession?.attendances.find((a) => a.studentId === studentId)?.status
        if (recordedStatus !== status) return null
        return <Badge tone={attendanceStatusTone[status]}>{attendanceStatusShortLabel[status]}</Badge>
      }

      const Icon = STATUS_ICONS[status]
      const selected = pending[studentId] === status
      return (
        <button
          type="button"
          title={attendanceStatusLabel[status]}
          onClick={() => setPending((prev) => ({ ...prev, [studentId]: status }))}
          className={`inline-flex h-8 w-8 items-center justify-center rounded-full transition-colors ${
            selected
              ? 'bg-brand-600 text-white'
              : 'text-slate-300 hover:bg-slate-100 hover:text-slate-500 dark:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-400'
          }`}
        >
          <Icon className="h-4 w-4" />
        </button>
      )
    },
  }))

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Davomat</h2>
          <Button variant="secondary" onClick={() => setShowAddStudent(true)} aria-label="Oʻquvchi qoʻshish">
            <UserPlus className="h-4 w-4" />
          </Button>
        </div>

        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() - 1, 1))}
            aria-label="Oldingi oy"
          >
            <ChevronLeft className="h-4 w-4" />
          </Button>
          <span className="min-w-[120px] text-center text-xs font-medium text-slate-500 dark:text-slate-400">
            {formatMonthYear(monthAnchor.getMonth() + 1, monthAnchor.getFullYear())}
          </span>
          <Button
            variant="secondary"
            onClick={() => setMonthAnchor((m) => new Date(m.getFullYear(), m.getMonth() + 1, 1))}
            disabled={isCurrentMonth}
            aria-label="Keyingi oy"
          >
            <ChevronRight className="h-4 w-4" />
          </Button>
          {!isBackToToday && (
            <Button variant="ghost" onClick={goToToday}>
              Bugun
            </Button>
          )}
        </div>
      </div>

      {pillDates.length === 0 ? (
        <p className="mb-4 text-sm text-slate-400 dark:text-slate-500">Bu oyda darslar qayd etilmagan.</p>
      ) : (
        <div className="mb-4 flex flex-wrap gap-1.5">
          {pillDates.map((d) => {
            const isSelected = isSameDay(d, selectedDate)
            const isToday = isSameDay(d, now)
            return (
              <button
                key={d.toDateString()}
                onClick={() => setSelectedDate(d)}
                className={`relative h-8 w-8 rounded-full text-xs font-semibold transition-colors ${
                  isSelected
                    ? 'bg-brand-600 text-white'
                    : 'bg-slate-100 text-slate-600 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                }`}
              >
                {d.getDate()}
                {isToday && (
                  <span className="absolute -bottom-1 left-1/2 h-1 w-1 -translate-x-1/2 rounded-full bg-amber-500" />
                )}
              </button>
            )
          })}
        </div>
      )}

      {!isSelectedToday && (
        <p className="mb-3 text-xs text-slate-400 dark:text-slate-500">
          Oʻtgan kun koʻrsatilmoqda — bu yerdan oʻzgartirib boʻlmaydi.
        </p>
      )}

      {roster.length === 0 ? (
        <EmptyState title="Guruhda oʻquvchi yoʻq" description="Boshlash uchun oʻquvchi qoʻshing." />
      ) : (
        <StudentsMatrixTable roster={roster} columns={columns} />
      )}

      {isSelectedToday && roster.length > 0 && (
        <div className="mt-4 flex justify-end">
          <Button onClick={() => saveMutation.mutate()} loading={saveMutation.isPending}>
            Davomatni saqlash
          </Button>
        </div>
      )}

      {showAddStudent && <AddStudentModal group={group} onClose={() => setShowAddStudent(false)} />}
    </Card>
  )
}
