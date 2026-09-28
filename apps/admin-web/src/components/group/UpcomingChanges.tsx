import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { ArrowRight, BellOff, CalendarClock, Plus } from 'lucide-react'
import { reschedules as reschedulesApi } from '../../lib/api'
import { dayLabel, formatDayMonth, toDateInputValue } from '../../lib/format'
import { levelStyles } from '../../lib/levelColor'
import { dateFromKey, dayKeyOf, weekdayCode } from '../../lib/schedule'
import type { Group, LessonReschedule } from '../../lib/types'
import { RescheduleModal } from '../schedule/RescheduleModal'

function shortDay(iso: string) {
  const date = dateFromKey(dayKeyOf(iso))
  return `${dayLabel[weekdayCode(date)]} ${formatDayMonth(date)}`
}

/** The group's moved lessons still ahead, plus a "move a lesson" entry point. */
export function UpcomingChanges({ group }: { group: Group }) {
  const [editing, setEditing] = useState<LessonReschedule | 'new' | null>(null)
  const accent = levelStyles(group.level?.color)
  const from = toDateInputValue(new Date())
  const to = toDateInputValue(new Date(Date.now() + 90 * 86_400_000))

  const query = useQuery({ queryKey: ['reschedules', from, to], queryFn: () => reschedulesApi.list(from, to) })
  const changes = (query.data ?? []).filter((r) => r.groupId === group.id)

  return (
    <div className="mb-6 flex flex-wrap items-center gap-2">
      {changes.map((change) => (
        <button
          key={change.id}
          onClick={() => setEditing(change)}
          className="inline-flex items-center gap-2 rounded-lg border border-dashed px-3 py-1.5 text-xs font-medium text-slate-600 transition-colors hover:bg-white dark:text-slate-300 dark:hover:bg-slate-900"
          style={{ borderColor: accent.hex }}
          title={change.reason ?? undefined}
        >
          <CalendarClock className="h-3.5 w-3.5" style={accent.text} />
          <span className="text-slate-400 line-through">{shortDay(change.originalDate)}</span>
          <ArrowRight className="h-3 w-3 text-slate-400" />
          <span className="font-semibold text-slate-900 dark:text-slate-100">
            {shortDay(change.newDate)}, {change.newTime}
          </span>
          {!change.notifiedAt && <BellOff className="h-3.5 w-3.5 text-amber-500" aria-label="Xabar berilmagan" />}
        </button>
      ))}
      <button
        onClick={() => setEditing('new')}
        className="inline-flex items-center gap-1.5 rounded-lg px-3 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 hover:text-slate-800 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
      >
        <Plus className="h-3.5 w-3.5" /> Darsni koʻchirish
      </button>

      {editing && (
        <RescheduleModal
          group={group}
          existing={editing === 'new' ? undefined : editing}
          onClose={() => setEditing(null)}
        />
      )}
    </div>
  )
}
