import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight } from 'lucide-react'
import { sessions as sessionsApi } from '../../lib/api'
import { attendanceStatusShortLabel, attendanceStatusTone, formatDate, homeworkResultStatusLabel } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Group, HomeworkResultStatus } from '../../lib/types'
import { Badge, Button, Card, EmptyState, Input, Select, Spinner } from '../ui'

export function RecentSessionsCard({ group }: { group: Group }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const sessionsQuery = useQuery({
    queryKey: ['group-sessions', group.id, 'all'],
    queryFn: () => sessionsApi.listForGroup(group.id),
  })

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Soʻnggi darslar</h2>

      {sessionsQuery.isLoading ? (
        <Spinner />
      ) : sessionsQuery.data?.length === 0 ? (
        <EmptyState title="Hali darslar qayd etilmagan" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {sessionsQuery.data?.map((session) => (
            <li key={session.id}>
              <button
                onClick={() => setExpandedId(expandedId === session.id ? null : session.id)}
                className="flex w-full items-center justify-between py-3 text-left"
              >
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                    {formatDate(session.date)} — {session.topic || 'Mavzu kiritilmagan'}
                  </p>
                  <div className="mt-1 flex flex-wrap gap-1">
                    {session.attendances.map((a) => (
                      <Badge key={a.id} tone={attendanceStatusTone[a.status]}>
                        {attendanceStatusShortLabel[a.status]}
                      </Badge>
                    ))}
                    {session.homework && <Badge tone="brand">Uy vazifasi</Badge>}
                  </div>
                </div>
                {expandedId === session.id ? (
                  <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                ) : (
                  <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                )}
              </button>

              {expandedId === session.id && session.homework && (
                <div className="pb-4">
                  <GradeHomeworkForm
                    group={group}
                    sessionId={session.id}
                    homeworkId={session.homework.id}
                    instructions={session.homework.instructions}
                  />
                </div>
              )}
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}

function GradeHomeworkForm({
  group,
  sessionId,
  instructions,
}: {
  group: Group
  sessionId: string
  homeworkId: string
  instructions: string
}) {
  const queryClient = useQueryClient()
  const roster = group.enrollments ?? []
  const [entries, setEntries] = useState<Record<string, { status: HomeworkResultStatus; score: string }>>(
    Object.fromEntries(roster.map((e) => [e.studentId, { status: 'COMPLETED' as HomeworkResultStatus, score: '' }])),
  )

  const gradeMutation = useMutation({
    mutationFn: () =>
      sessionsApi.recordHomeworkResults(
        sessionId,
        Object.entries(entries).map(([studentId, entry]) => ({
          studentId,
          status: entry.status,
          score: entry.score === '' ? null : Number(entry.score),
        })),
      ),
    onSuccess: () => {
      notifySuccess('Uy vazifasi natijalari saqlandi')
      queryClient.invalidateQueries({ queryKey: ['group-sessions', group.id] })
    },
    onError: (err) => notifyError(err, 'Uy vazifasi natijalarini saqlab boʻlmadi'),
  })

  return (
    <div className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-4">
      <p className="mb-3 text-xs text-slate-500 dark:text-slate-400">Uy vazifasi: {instructions}</p>
      <div className="space-y-2">
        {roster.map((enrollment) => {
          const entry = entries[enrollment.studentId]
          return (
            <div key={enrollment.id} className="flex items-center gap-2">
              <span className="w-32 shrink-0 truncate text-sm text-slate-700 dark:text-slate-300">
                {enrollment.student?.firstName} {enrollment.student?.lastName}
              </span>
              <Select
                value={entry.status}
                onChange={(e) =>
                  setEntries((prev) => ({
                    ...prev,
                    [enrollment.studentId]: { ...prev[enrollment.studentId], status: e.target.value as HomeworkResultStatus },
                  }))
                }
                className="w-40"
              >
                <option value="COMPLETED">{homeworkResultStatusLabel.COMPLETED}</option>
                <option value="NOT_COMPLETED">{homeworkResultStatusLabel.NOT_COMPLETED}</option>
              </Select>
              <Input
                type="number"
                min={0}
                max={100}
                placeholder="Ball"
                value={entry.score}
                onChange={(e) =>
                  setEntries((prev) => ({
                    ...prev,
                    [enrollment.studentId]: { ...prev[enrollment.studentId], score: e.target.value },
                  }))
                }
                className="w-20"
              />
            </div>
          )
        })}
      </div>
      <div className="mt-3 flex justify-end">
        <Button onClick={() => gradeMutation.mutate()} loading={gradeMutation.isPending}>
          Natijalarni saqlash
        </Button>
      </div>
    </div>
  )
}
