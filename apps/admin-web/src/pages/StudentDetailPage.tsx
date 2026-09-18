import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { students as studentsApi } from '../lib/api'
import { formatDate, studentStatusLabel } from '../lib/format'
import { notifyError, notifySuccess } from '../lib/toast'
import type { StudentStatus } from '../lib/types'
import { useAuth } from '../lib/auth'
import { Button, Card, ErrorBanner, PageHeader, Select, Spinner } from '../components/ui'
import { GroupsCard } from '../components/student/GroupsCard'
import { ParentsCard } from '../components/student/ParentsCard'
import { AttendanceCard } from '../components/student/AttendanceCard'
import { MarksCard } from '../components/student/MarksCard'
import { PointsCard } from '../components/student/PointsCard'
import { PaymentsCard } from '../components/student/PaymentsCard'

const STATUSES: StudentStatus[] = ['ACTIVE', 'PAUSED', 'INACTIVE', 'COMPLETED', 'LEFT']

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { actor } = useAuth()
  const queryClient = useQueryClient()
  const [code, setCode] = useState<string | null>(null)

  const overviewQuery = useQuery({
    queryKey: ['student-overview', id],
    queryFn: () => studentsApi.overview(id!),
    enabled: !!id,
  })

  const statusMutation = useMutation({
    mutationFn: (status: StudentStatus) => studentsApi.update(id!, { status }),
    onSuccess: () => {
      notifySuccess('Holat yangilandi')
      queryClient.invalidateQueries({ queryKey: ['student-overview', id] })
    },
    onError: (err) => notifyError(err, 'Holatni yangilab boʻlmadi'),
  })

  const linkingCodeMutation = useMutation({
    mutationFn: () => studentsApi.issueLinkingCode(id!),
    onSuccess: (result) => {
      setCode(result.code)
      notifySuccess('Kod yaratildi')
    },
    onError: (err) => notifyError(err, 'Kod berib boʻlmadi'),
  })

  if (overviewQuery.isLoading) return <Spinner />
  if (overviewQuery.isError || !overviewQuery.data) return <ErrorBanner message="Oʻquvchi topilmadi" />

  const overview = overviewQuery.data
  const { student } = overview
  const activeEnrollments = overview.enrollments.filter((e) => e.status === 'ACTIVE')

  return (
    <div>
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={`Tugʻilgan: ${formatDate(student.dob)}${student.phone ? ` · ${student.phone}` : ''}`}
        actions={
          actor?.role === 'ADMIN' && (
            <Select
              value={student.status}
              onChange={(e) => statusMutation.mutate(e.target.value as StudentStatus)}
              className="w-40"
            >
              {STATUSES.map((s) => (
                <option key={s} value={s}>
                  {studentStatusLabel[s]}
                </option>
              ))}
            </Select>
          )
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <GroupsCard enrollments={overview.enrollments} />
        <ParentsCard studentId={student.id} links={overview.parents} />

        <AttendanceCard
          totals={overview.attendance.totals}
          rate={overview.attendance.rate}
          recent={overview.attendance.recent}
        />
        <PointsCard
          studentId={student.id}
          total={overview.points.total}
          recent={overview.points.recent}
          activeEnrollments={activeEnrollments}
          actor={actor}
        />

        <MarksCard assessmentResults={overview.assessmentResults} homeworkResults={overview.homeworkResults} />
        <PaymentsCard studentId={student.id} payments={overview.payments.list} outstanding={overview.payments.outstanding} />

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Telegram kirish huquqi</h2>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Oʻquvchi Telegram hisobini ulashi uchun bir martalik kod bering.
          </p>
          <Button variant="secondary" onClick={() => linkingCodeMutation.mutate()} loading={linkingCodeMutation.isPending}>
            <KeyRound className="h-4 w-4" /> Kod berish
          </Button>
          {code && (
            <div className="mt-4 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-4 text-center">
              <p className="text-xs text-slate-500 dark:text-slate-400">Ushbu kodni oʻquvchiga bering</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-slate-900 dark:text-slate-100">{code}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
