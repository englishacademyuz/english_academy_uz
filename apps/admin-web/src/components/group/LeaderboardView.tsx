import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trophy } from 'lucide-react'
import { points as pointsApi } from '../../lib/api'
import { getTimeframeRange, TIMEFRAME_LABEL, type TimeframeKind } from '../../lib/dateRange'
import { useAuth } from '../../lib/auth'
import type { Group } from '../../lib/types'
import { Badge, Button, Spinner, Tabs } from '../ui'
import { AwardPointsModal } from '../shared/AwardPointsModal'
import { DetailMatrix, type MatrixColumn } from './DetailMatrix'

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
  const roster = group.enrollments ?? []

  const leaderboardQuery = useQuery({
    queryKey: ['group-leaderboard', group.id, timeframe],
    queryFn: () => pointsApi.leaderboardForGroup(group.id, range ?? undefined),
  })

  const canAward = actor?.role === 'ADMIN' || actor?.teacherId === group.teacherId
  const entries = leaderboardQuery.data ?? []
  const pointsByStudent = new Map(entries.map((e) => [e.student.id, e.points]))
  const topScore = Math.max(0, ...entries.map((e) => e.points))

  // Rows follow the frozen roster's order (not points rank) so left/right stay aligned --
  // the leader is still called out with a trophy on their own row instead of by position.
  const columns: MatrixColumn[] = [
    {
      key: 'points',
      grow: true,
      header: (
        <div className="ml-auto">
          <Tabs
            tabs={TIMEFRAMES.map((k) => ({ key: k, label: TIMEFRAME_LABEL[k] }))}
            active={timeframe}
            onChange={setTimeframe}
            variant="segmented"
            size="xs"
          />
        </div>
      ),
      render: (studentId) => {
        const pts = pointsByStudent.get(studentId) ?? 0
        const enrollment = roster.find((e) => e.studentId === studentId)
        const studentName = `${enrollment?.student?.firstName ?? ''} ${enrollment?.student?.lastName ?? ''}`.trim()
        return (
          <div className="flex w-full items-center justify-end gap-2 pr-1">
            {canAward && (
              <Button
                variant="ghost"
                onClick={() => setAwardingFor({ id: studentId, name: studentName })}
                aria-label="Ball berish"
              >
                <Plus className="h-4 w-4" />
              </Button>
            )}
            {pts === topScore && topScore > 0 && <Trophy className="h-4 w-4 shrink-0 text-amber-500" />}
            <Badge tone={pointsTone(pts)}>{pts} ball</Badge>
          </div>
        )
      },
    },
  ]

  return (
    <div className="flex flex-1 flex-col">
      {leaderboardQuery.isLoading ? <Spinner /> : <DetailMatrix roster={roster} columns={columns} />}

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
    </div>
  )
}
