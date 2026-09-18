import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { formatDate, pointActivityTypeLabel } from '../../lib/format'
import type { Actor, Enrollment, PointTransaction } from '../../lib/types'
import { Badge, Button, Card, EmptyState } from '../ui'
import { AwardPointsModal } from '../shared/AwardPointsModal'

export function PointsCard({
  studentId,
  total,
  recent,
  activeEnrollments,
  actor,
}: {
  studentId: string
  total: number
  recent: PointTransaction[]
  activeEnrollments: Enrollment[]
  actor?: Actor | null
}) {
  const [showAward, setShowAward] = useState(false)
  const queryClient = useQueryClient()
  const eligibleGroups = activeEnrollments
    .map((e) => e.group)
    .filter((g): g is NonNullable<typeof g> => !!g)
    .filter((g) => actor?.role === 'ADMIN' || g.teacherId === actor?.teacherId)

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ballar</h2>
        <Button variant="secondary" onClick={() => setShowAward(true)} disabled={eligibleGroups.length === 0}>
          <Plus className="h-4 w-4" /> Ball berish
        </Button>
      </div>

      <div className="mb-4 rounded-lg bg-brand-50 p-4 text-center dark:bg-brand-500/10">
        <p className="text-2xl font-semibold text-brand-700 dark:text-brand-300">{total}</p>
        <p className="text-xs text-brand-600 dark:text-brand-400">Jami ball (barcha guruhlar boʻyicha)</p>
      </div>

      {recent.length === 0 ? (
        <EmptyState title="Hali ball berilmagan" />
      ) : (
        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {recent.map((t) => (
            <li key={t.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm text-slate-700 dark:text-slate-300">
                  {pointActivityTypeLabel[t.activityType]}
                  {t.note ? ` · ${t.note}` : ''}
                </p>
                <p className="text-xs text-slate-400 dark:text-slate-500">
                  {t.group?.name} · {formatDate(t.createdAt)}
                </p>
              </div>
              <Badge tone={t.points >= 0 ? 'green' : 'red'}>
                {t.points >= 0 ? '+' : ''}
                {t.points}
              </Badge>
            </li>
          ))}
        </ul>
      )}

      {showAward && (
        <AwardPointsModal
          studentId={studentId}
          groups={eligibleGroups}
          onClose={() => setShowAward(false)}
          onAwarded={() => {
            queryClient.invalidateQueries({ queryKey: ['student-overview', studentId] })
            setShowAward(false)
          }}
        />
      )}
    </Card>
  )
}
