import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trophy } from 'lucide-react'
import { points as pointsApi } from '../../lib/api'
import { getTimeframeRange, TIMEFRAME_LABEL, type TimeframeKind } from '../../lib/dateRange'
import { useAuth } from '../../lib/auth'
import type { Group } from '../../lib/types'
import { Badge, Button, Card, EmptyState, Spinner, Tabs } from '../ui'
import { AwardPointsModal } from '../shared/AwardPointsModal'

const TIMEFRAMES: TimeframeKind[] = ['week', 'month', 'all']

/** Points >= 80 → gold, 60–79 → green, below that → plain (§51.3 doesn't define tiers -- this is presentational only). */
function pointsTone(points: number): 'gold' | 'green' | 'slate' {
  if (points >= 80) return 'gold'
  if (points >= 60) return 'green'
  return 'slate'
}

export function LeaderboardView({ group }: { group: Group }) {
  const { actor } = useAuth()
  const [timeframe, setTimeframe] = useState<TimeframeKind>('month')
  const [awardingFor, setAwardingFor] = useState<{ id: string; name: string } | null>(null)
  const queryClient = useQueryClient()
  const range = getTimeframeRange(timeframe)

  const leaderboardQuery = useQuery({
    queryKey: ['group-leaderboard', group.id, timeframe],
    queryFn: () => pointsApi.leaderboardForGroup(group.id, range ?? undefined),
  })

  const canAward = actor?.role === 'ADMIN' || actor?.teacherId === group.teacherId
  const entries = leaderboardQuery.data ?? []
  const topScore = entries[0]?.points ?? 0

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ballar reytingi</h2>
        <Tabs
          tabs={TIMEFRAMES.map((k) => ({ key: k, label: TIMEFRAME_LABEL[k] }))}
          active={timeframe}
          onChange={setTimeframe}
        />
      </div>

      {leaderboardQuery.isLoading ? (
        <Spinner />
      ) : entries.length === 0 ? (
        <EmptyState title="Guruhda oʻquvchi yoʻq" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {entries.map((entry, i) => {
            const isTop = i === 0 && topScore > 0
            return (
              <li key={entry.student.id} className="flex items-center justify-between py-2.5">
                <div className="flex items-center gap-2">
                  {isTop && <Trophy className="h-4 w-4 text-amber-500" />}
                  <span
                    className={`text-sm ${
                      isTop ? 'font-semibold text-slate-900 dark:text-slate-100' : 'text-slate-700 dark:text-slate-300'
                    }`}
                  >
                    {entry.student.firstName} {entry.student.lastName}
                  </span>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone={pointsTone(entry.points)}>{entry.points} ball</Badge>
                  {canAward && (
                    <Button
                      variant="ghost"
                      onClick={() =>
                        setAwardingFor({ id: entry.student.id, name: `${entry.student.firstName} ${entry.student.lastName}` })
                      }
                    >
                      <Plus className="h-4 w-4" />
                    </Button>
                  )}
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {awardingFor && (
        <AwardPointsModal
          studentId={awardingFor.id}
          studentName={awardingFor.name}
          groups={[{ id: group.id, name: group.name }]}
          onClose={() => setAwardingFor(null)}
          onAwarded={() => {
            queryClient.invalidateQueries({ queryKey: ['group-leaderboard', group.id] })
            setAwardingFor(null)
          }}
        />
      )}
    </Card>
  )
}
