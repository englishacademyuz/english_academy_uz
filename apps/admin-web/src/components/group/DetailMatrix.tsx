import type { ReactNode } from 'react'
import type { Enrollment } from '../../lib/types'

export type MatrixColumn = {
  key: string
  header: ReactNode
  render: (studentId: string) => ReactNode
  /** Column width in px -- wider for score inputs/badges, narrower for single icons. Default 88. */
  width?: number
  /** Stretches this column to fill whatever space is left in the row instead of sitting at a
   * fixed width -- for a single-column view (e.g. Reyting) where the row would otherwise sit
   * only as wide as its content, stranding the rest of the panel as dead space on the right. */
  grow?: boolean
}

/**
 * Right-hand half of the group's frozen-roster table (see StudentsTab /
 * RosterColumn): column headers plus one row per student, walked in the
 * exact same roster order as the frozen left column so row N here is always
 * row N there. Never renders the student's name -- RosterColumn owns that,
 * once, so it isn't duplicated per tab. Scrolls horizontally on its own when
 * a tab has more columns than fit; the roster column never moves.
 */
export function DetailMatrix({
  roster,
  columns,
  groupHeader,
}: {
  roster: Enrollment[]
  columns: MatrixColumn[]
  groupHeader?: ReactNode
}) {
  return (
    <div className="min-w-0 overflow-x-auto">
      <div className="flex min-w-max flex-col">
        <div
          className="flex shrink-0 flex-col justify-end gap-1.5 overflow-hidden border-b border-slate-100 pb-2 dark:border-slate-800"
          style={{ height: 'var(--colhead-h)' }}
        >
          {groupHeader}
          <div className="flex">
            {columns.map((col) => (
              <div
                key={col.key}
                style={col.grow ? { flex: '1 1 0%' } : { width: col.width ?? 88 }}
                title={typeof col.header === 'string' ? col.header : undefined}
                className={`flex justify-center overflow-hidden whitespace-nowrap px-2 ${col.grow ? '' : 'shrink-0'}`}
              >
                {col.header}
              </div>
            ))}
          </div>
        </div>

        {roster.length === 0 ? (
          <div
            style={{ height: 'var(--row-h)' }}
            className="flex items-center justify-center text-sm text-slate-400 dark:text-slate-500"
          >
            Guruhda oʻquvchi yoʻq
          </div>
        ) : (
          roster.map((enrollment) => (
            <div
              key={enrollment.id}
              className="flex shrink-0 items-center border-b border-slate-100 dark:border-slate-800"
              style={{ height: 'var(--row-h)' }}
            >
              {columns.map((col) => (
                <div
                  key={col.key}
                  style={col.grow ? { flex: '1 1 0%' } : { width: col.width ?? 88 }}
                  className={`flex items-center justify-center px-2 tabular-nums ${col.grow ? '' : 'shrink-0'}`}
                >
                  {col.render(enrollment.studentId)}
                </div>
              ))}
            </div>
          ))
        )}
      </div>
    </div>
  )
}
