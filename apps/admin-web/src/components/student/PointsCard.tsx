import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trophy } from 'lucide-react'
import { points as pointsApi } from '../../lib/api'
import { startOfMonth } from '../../lib/dateRange'
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

  const monthTotal = useMemo(() => {
    const monthStart = startOfMonth(new Date())
    return recent.filter((t) => new Date(t.createdAt) >= monthStart).reduce((sum, t) => sum + t.points, 0)
  }, [recent])

  // Place in the student's (first) active group, from that group's own ledger only.
  const rankGroup = activeEnrollments[0]?.group
  const leaderboardQuery = useQuery({
    queryKey: ['group-leaderboard', rankGroup?.id, 'all'],
    queryFn: () => pointsApi.leaderboardForGroup(rankGroup!.id),
    enabled: !!rankGroup,
  })
  const board = leaderboardQuery.data ?? []
  const rankIndex = board.findIndex((entry) => entry.student.id === studentId)

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Reyting</h2>
        <Button variant="secondary" onClick={() => setShowAward(true)} disabled={eligibleGroups.length === 0}>
          <Plus className="h-4 w-4" /> Ball berish
        </Button>
      </div>

      <div className="mb-4 rounded-xl bg-gradient-to-br from-brand-50 to-yellow-50 px-4 py-6 text-center ring-1 ring-inset ring-brand-100 dark:from-brand-500/10 dark:to-yellow-500/5 dark:ring-brand-500/20">
        <Trophy className="mx-auto mb-2 h-7 w-7 text-yellow-500" />
        <p className="text-6xl font-extrabold leading-none tracking-tight text-brand-700 tabular-nums dark:text-brand-300">
          {total}
        </p>
        <p className="mt-2 text-sm font-medium text-brand-600 dark:text-brand-400">Reyting bali</p>
        <div className="mt-4 flex flex-wrap justify-center gap-2 text-xs">
          <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-700">
            Shu oy: {monthTotal >= 0 ? '+' : ''}
            {monthTotal}
          </span>
          {rankGroup && rankIndex >= 0 && (
            <span className="rounded-full bg-white/80 px-3 py-1 font-medium text-slate-700 ring-1 ring-inset ring-slate-200 dark:bg-slate-900/60 dark:text-slate-300 dark:ring-slate-700">
              {rankGroup.name}: {rankIndex + 1}-oʻrin / {board.length}
            </span>
          )}
        </div>
      </div>

      {recent.length === 0 ? (
        <EmptyState title="Hali ball berilmagan" />
      ) : (
        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {recent.slice(0, 50).map((t) => (
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
