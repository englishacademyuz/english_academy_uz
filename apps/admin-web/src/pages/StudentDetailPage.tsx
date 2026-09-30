import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams } from 'react-router-dom'
import { KeyRound, Pencil, Trash2 } from 'lucide-react'
import { students as studentsApi } from '../lib/api'
import { ageFrom, studentStatusLabel } from '../lib/format'
import { notifyError, notifySuccess } from '../lib/toast'
import type { StudentStatus } from '../lib/types'
import { useAuth } from '../lib/auth'
import { Button, Card, ErrorBanner, PageHeader, Select, Spinner } from '../components/ui'
import { GroupsCard } from '../components/student/GroupsCard'
import { DiaryCard } from '../components/student/DiaryCard'
import { PointsCard } from '../components/student/PointsCard'
import { PaymentsCard } from '../components/student/PaymentsCard'
import { PaymentReminderButton } from '../components/shared/PaymentReminderButton'
import { StudentFormModal } from '../components/student/StudentFormModal'
import { DeleteStudentModal } from '../components/student/DeleteStudentModal'

const STATUSES: StudentStatus[] = ['ACTIVE', 'PAUSED', 'INACTIVE', 'COMPLETED', 'LEFT']

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { actor } = useAuth()
  const queryClient = useQueryClient()
  const navigate = useNavigate()
  const [code, setCode] = useState<string | null>(null)
  const [showEdit, setShowEdit] = useState(false)
  const [showDelete, setShowDelete] = useState(false)

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
  const age = ageFrom(student.dob)
  const isAdmin = actor?.role === 'ADMIN'

  return (
    <div>
      <PageHeader
        title={`${student.firstName} ${student.lastName}`}
        description={[age !== null ? `${age} yosh` : null, student.phone].filter(Boolean).join(' · ')}
        actions={
          <div className="flex items-center gap-2">
            {overview.payments.reminder && (
              <PaymentReminderButton studentId={student.id} reminder={overview.payments.reminder} />
            )}
            {isAdmin && (
              <Button variant="secondary" onClick={() => setShowEdit(true)}>
                <Pencil className="h-4 w-4" /> Tahrirlash
              </Button>
            )}
            {isAdmin && (
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
            )}
            {isAdmin && (
              <Button variant="ghost" onClick={() => setShowDelete(true)} aria-label="Oʻquvchini oʻchirish" title="Oʻquvchini oʻchirish">
                <Trash2 className="h-4 w-4 text-red-600" />
              </Button>
            )}
          </div>
        }
      />

      <div className="grid gap-6 lg:grid-cols-2">
        <GroupsCard enrollments={overview.enrollments} />
        <PointsCard
          studentId={student.id}
          total={overview.points.total}
          recent={overview.points.recent}
          activeEnrollments={activeEnrollments}
          actor={actor}
        />

        <DiaryCard overview={overview} />

        <PaymentsCard
          student={student}
          payments={overview.payments.list}
          reminder={overview.payments.reminder}
          enrollment={activeEnrollments[0]}
        />

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Telegram kirish huquqi</h2>
          <p className="mb-3 text-sm text-slate-500 dark:text-slate-400">
            Oʻquvchi Telegram botga shu kod bilan kiradi. Kod 24 soat amal qiladi. Ulangan hisoblar: <span className="font-medium text-slate-700 dark:text-slate-300">{overview.telegramLinkCount}</span>
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

      {showEdit && (
        <StudentFormModal
          student={student}
          onClose={() => setShowEdit(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['student-overview', id] })
            queryClient.invalidateQueries({ queryKey: ['students'] })
            setShowEdit(false)
          }}
        />
      )}
      {showDelete && (
        <DeleteStudentModal student={student} onClose={() => setShowDelete(false)} onDeleted={() => navigate('/students')} />
      )}
    </div>
  )
}
