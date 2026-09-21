import { useMemo } from 'react'
import { UserPlus } from 'lucide-react'
import { buildAccentMap, initials } from '../../lib/format'
import type { Enrollment } from '../../lib/types'

/**
 * The frozen left column of the group's student workspace (see StudentsTab).
 * Rendered exactly once, independent of the active tab -- JournalView,
 * MarksMatrixView etc. only ever render the columns to its right, in the
 * same roster order, so this never re-renders or scrolls on tab switch.
 */
export function RosterColumn({ roster, onAddStudent }: { roster: Enrollment[]; onAddStudent: () => void }) {
  const avatarAccents = useMemo(() => buildAccentMap(roster.map((e) => e.studentId)), [roster])

  return (
    <div className="flex shrink-0 flex-col border-r border-slate-100 dark:border-slate-800">
      <div
        className="flex shrink-0 items-center justify-between gap-2 px-5"
        style={{ height: 'var(--tabbar-h)' }}
      >
        <div className="flex items-center gap-2">
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Guruh oʻquvchilari</h2>
          <span className="inline-flex h-5 min-w-5 items-center justify-center rounded-full bg-brand-100 px-1.5 text-xs font-semibold text-brand-700 dark:bg-brand-500/15 dark:text-brand-300">
            {roster.length}
          </span>
        </div>
        <button
          type="button"
          onClick={onAddStudent}
          title="Oʻquvchi qoʻshish"
          className="flex h-7 w-7 shrink-0 items-center justify-center rounded-lg text-slate-400 transition-colors hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        >
          <UserPlus className="h-4 w-4" />
        </button>
      </div>

      <div
        className="flex shrink-0 items-end border-y border-slate-100 px-5 pb-2 dark:border-slate-800"
        style={{ height: 'var(--colhead-h)' }}
      >
        <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          Oʻquvchi
        </span>
      </div>

      {roster.length === 0 ? (
        <div
          className="flex shrink-0 items-center px-5 text-sm text-slate-400 dark:text-slate-500"
          style={{ height: 'var(--row-h)' }}
        >
          Guruhda oʻquvchi yoʻq
        </div>
      ) : (
        roster.map((enrollment, i) => {
          const accent = avatarAccents.get(enrollment.studentId)
          const fullName = `${enrollment.student?.firstName ?? ''} ${enrollment.student?.lastName ?? ''}`.trim()
          return (
            <div
              key={enrollment.id}
              className="flex shrink-0 items-center gap-3 border-b border-slate-100 px-5 dark:border-slate-800"
              style={{ height: 'var(--row-h)' }}
            >
              <span
                className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${accent?.avatar ?? 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300'}`}
              >
                {initials(fullName)}
              </span>
              <div className="min-w-0">
                <p className="truncate text-sm font-medium leading-tight text-slate-900 dark:text-slate-100">{fullName}</p>
                <p className="text-[11px] leading-tight text-slate-400 dark:text-slate-500">ID {String(i + 1).padStart(4, '0')}</p>
              </div>
            </div>
          )
        })
      )}
    </div>
  )
}
