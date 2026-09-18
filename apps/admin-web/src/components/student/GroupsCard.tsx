import { enrollmentEndReasonLabel, formatDate } from '../../lib/format'
import type { Enrollment } from '../../lib/types'
import { Badge, Card, EmptyState } from '../ui'

export function GroupsCard({ enrollments }: { enrollments: Enrollment[] }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Guruhlar va oʻqish tarixi</h2>
      {enrollments.length === 0 ? (
        <EmptyState title="Hali biror guruhga qoʻshilmagan" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {enrollments.map((enrollment) => {
            const group = enrollment.group
            const level = group?.level
            const course = level?.course
            const subject = course?.subject
            return (
              <li key={enrollment.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {group?.name ?? 'Guruh'}
                  </p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {[subject?.name, course?.name, level?.name].filter(Boolean).join(' · ')}
                    {group?.teacher?.fullName ? ` · ${group.teacher.fullName}` : ''}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-400 dark:text-slate-500">
                    {formatDate(enrollment.startDate)} –{' '}
                    {enrollment.endDate ? formatDate(enrollment.endDate) : 'hozirgacha'}
                  </p>
                </div>
                <Badge tone={enrollment.status === 'ACTIVE' ? 'green' : 'slate'}>
                  {enrollment.status === 'ACTIVE'
                    ? 'Faol'
                    : (enrollment.endReason && enrollmentEndReasonLabel[enrollment.endReason]) ?? 'Tugagan'}
                </Badge>
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}
