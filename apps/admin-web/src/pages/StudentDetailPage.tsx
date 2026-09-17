import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { KeyRound } from 'lucide-react'
import { ApiError, students as studentsApi } from '../lib/api'
import { enrollmentEndReasonLabel, formatDate, studentStatusLabel } from '../lib/format'
import type { StudentStatus } from '../lib/types'
import { useAuth } from '../lib/auth'
import { Badge, Button, Card, ErrorBanner, PageHeader, Select, Spinner } from '../components/ui'

const STATUSES: StudentStatus[] = ['ACTIVE', 'PAUSED', 'INACTIVE', 'COMPLETED', 'LEFT']

export function StudentDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { actor } = useAuth()
  const queryClient = useQueryClient()
  const [code, setCode] = useState<string | null>(null)
  const [error, setError] = useState<string | null>(null)

  const studentQuery = useQuery({
    queryKey: ['student', id],
    queryFn: () => studentsApi.get(id!),
    enabled: !!id,
  })

  const statusMutation = useMutation({
    mutationFn: (status: StudentStatus) => studentsApi.update(id!, { status }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['student', id] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Holatni yangilab boʻlmadi'),
  })

  const linkingCodeMutation = useMutation({
    mutationFn: () => studentsApi.issueLinkingCode(id!),
    onSuccess: (result) => setCode(result.code),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Kod berib boʻlmadi'),
  })

  if (studentQuery.isLoading) return <Spinner />
  if (studentQuery.isError || !studentQuery.data) return <ErrorBanner message="Oʻquvchi topilmadi" />

  const student = studentQuery.data

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

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <div className="grid gap-6 lg:grid-cols-2">
        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Oʻqish tarixi</h2>
          {student.enrollments?.length ? (
            <ul className="divide-y divide-slate-100">
              {student.enrollments.map((enrollment) => (
                <li key={enrollment.id} className="flex items-center justify-between py-2">
                  <div className="text-sm text-slate-700">
                    {formatDate(enrollment.startDate)} –{' '}
                    {enrollment.endDate ? formatDate(enrollment.endDate) : 'hozirgacha'}
                  </div>
                  <Badge tone={enrollment.status === 'ACTIVE' ? 'green' : 'slate'}>
                    {enrollment.status === 'ACTIVE'
                      ? 'Faol'
                      : (enrollment.endReason && enrollmentEndReasonLabel[enrollment.endReason]) ?? 'Tugagan'}
                  </Badge>
                </li>
              ))}
            </ul>
          ) : (
            <p className="text-sm text-slate-400">Hali oʻqish tarixi yoʻq.</p>
          )}
        </Card>

        <Card className="p-5">
          <h2 className="mb-3 text-sm font-semibold text-slate-900">Telegram kirish huquqi</h2>
          <p className="mb-3 text-sm text-slate-500">
            Oʻquvchi Telegram hisobini ulashi uchun bir martalik kod bering.
          </p>
          <Button variant="secondary" onClick={() => linkingCodeMutation.mutate()} loading={linkingCodeMutation.isPending}>
            <KeyRound className="h-4 w-4" /> Kod berish
          </Button>
          {code && (
            <div className="mt-4 rounded-lg bg-slate-50 p-4 text-center">
              <p className="text-xs text-slate-500">Ushbu kodni oʻquvchiga bering</p>
              <p className="mt-1 font-mono text-2xl font-semibold tracking-widest text-slate-900">{code}</p>
            </div>
          )}
        </Card>
      </div>
    </div>
  )
}
