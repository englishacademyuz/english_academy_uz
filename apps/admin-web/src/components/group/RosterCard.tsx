import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { UserPlus } from 'lucide-react'
import { ApiError, enrollments as enrollmentsApi, students as studentsApi } from '../../lib/api'
import { todayInputValue } from '../../lib/format'
import type { Group } from '../../lib/types'
import { Button, Card, EmptyState, ErrorBanner, Select } from '../ui'

export function RosterCard({ group }: { group: Group }) {
  const queryClient = useQueryClient()
  const [selectedStudentId, setSelectedStudentId] = useState('')
  const [error, setError] = useState<string | null>(null)

  const studentsQuery = useQuery({ queryKey: ['students', 'ACTIVE'], queryFn: () => studentsApi.list('ACTIVE') })

  const activeEnrollments = group.enrollments ?? []
  const enrolledStudentIds = new Set(activeEnrollments.map((e) => e.studentId))
  const availableStudents = (studentsQuery.data ?? []).filter((s) => !enrolledStudentIds.has(s.id))

  const enrollMutation = useMutation({
    mutationFn: () => enrollmentsApi.enroll(group.id, selectedStudentId, todayInputValue()),
    onSuccess: () => {
      setSelectedStudentId('')
      queryClient.invalidateQueries({ queryKey: ['group', group.id] })
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : "Oʻquvchini yozib boʻlmadi"),
  })

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Roʻyxat ({activeEnrollments.length})</h2>
      </div>

      {error && (
        <div className="mb-3">
          <ErrorBanner message={error} />
        </div>
      )}

      <form
        className="mb-4 flex gap-2"
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          if (selectedStudentId) enrollMutation.mutate()
        }}
      >
        <Select value={selectedStudentId} onChange={(e) => setSelectedStudentId(e.target.value)}>
          <option value="">Faol oʻquvchini yozish…</option>
          {availableStudents.map((s) => (
            <option key={s.id} value={s.id}>
              {s.firstName} {s.lastName}
            </option>
          ))}
        </Select>
        <Button type="submit" variant="secondary" disabled={!selectedStudentId} loading={enrollMutation.isPending}>
          <UserPlus className="h-4 w-4" />
        </Button>
      </form>

      {activeEnrollments.length === 0 ? (
        <EmptyState title="Hali oʻquvchi yozilmagan" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {activeEnrollments.map((enrollment) => (
            <li key={enrollment.id} className="py-2">
              <Link
                to={`/students/${enrollment.studentId}`}
                className="text-sm font-medium text-slate-700 hover:text-brand-600"
              >
                {enrollment.student?.firstName} {enrollment.student?.lastName}
              </Link>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
