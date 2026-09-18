import type { ReactNode } from 'react'
import type { Enrollment } from '../../lib/types'
import { EmptyState } from '../ui'

export type MatrixColumn = {
  key: string
  header: ReactNode
  render: (studentId: string) => ReactNode
}

/**
 * The one table shape shared by every student-centric view (attendance,
 * marks, payments): first column is always the student, the rest change
 * per mode. Each mode builds its own `columns` and hands the roster+columns
 * here instead of re-implementing the table markup.
 */
export function StudentsMatrixTable({ roster, columns }: { roster: Enrollment[]; columns: MatrixColumn[] }) {
  if (roster.length === 0) return <EmptyState title="Guruhda oʻquvchi yoʻq" />

  return (
    <div className="overflow-x-auto">
      <table className="w-full border-collapse text-sm">
        <thead>
          <tr>
            <th className="sticky left-0 z-10 bg-white dark:bg-slate-900 px-2 py-2 text-left text-xs font-medium text-slate-500 dark:text-slate-400">
              Oʻquvchi
            </th>
            {columns.map((col) => (
              <th key={col.key} className="px-2 py-2 text-center text-xs font-medium text-slate-500 dark:text-slate-400">
                {col.header}
              </th>
            ))}
          </tr>
        </thead>
        <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
          {roster.map((enrollment) => (
            <tr key={enrollment.id}>
              <td className="sticky left-0 z-10 whitespace-nowrap bg-white dark:bg-slate-900 px-2 py-2 text-sm font-medium text-slate-900 dark:text-slate-100">
                {enrollment.student?.firstName} {enrollment.student?.lastName}
              </td>
              {columns.map((col) => (
                <td key={col.key} className="px-2 py-2 text-center">
                  {col.render(enrollment.studentId)}
                </td>
              ))}
            </tr>
          ))}
        </tbody>
      </table>
    </div>
  )
}
