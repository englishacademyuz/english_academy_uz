import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus, Trophy } from 'lucide-react'
import { points as pointsApi } from '../../lib/api'
import { getTimeframeRange, TIMEFRAME_LABEL, type TimeframeKind } from '../../lib/dateRange'
import { useAuth } from '../../lib/auth'
import { UZ_MONTHS } from '../../lib/format'
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

/** Each finished month's winner(s), newest first -- recorded on the 1st, when points start again from 0. */
function ChampionHistory({ groupId }: { groupId: string }) {
  const championsQuery = useQuery({
    queryKey: ['group-champions', groupId],
    queryFn: () => pointsApi.championsForGroup(groupId),
  })
  const months = championsQuery.data ?? []
  if (months.length === 0) return null

  return (
    <div className="flex flex-wrap items-center gap-2 border-b border-slate-200 px-4 py-2.5">
      <span className="text-xs font-semibold uppercase text-slate-500">Oy chempionlari</span>
      {months.map((m) => (
        <span
          key={`${m.year}-${m.month}`}
          className="inline-flex items-center gap-1.5 rounded-full bg-amber-50 px-2.5 py-1 text-xs font-medium text-amber-900 ring-1 ring-amber-200"
        >
          <Trophy className="h-3.5 w-3.5 text-amber-500" />
          <span className="capitalize">{UZ_MONTHS[m.month - 1]}</span>
          {m.year !== new Date().getFullYear() && <span>{m.year}</span>}:
          <span className="font-semibold">
            {m.winners.map((w) => `${w.student.firstName} ${w.student.lastName}`).join(', ')}
          </span>
          <span className="text-amber-700">({m.winners[0].points} ball)</span>
        </span>
      ))}
    </div>
  )
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
      <ChampionHistory groupId={group.id} />
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
