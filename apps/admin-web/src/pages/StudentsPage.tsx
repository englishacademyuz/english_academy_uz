import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { ApiError, students as studentsApi } from '../lib/api'
import { studentStatusLabel, studentStatusTone } from '../lib/format'
import type { StudentStatus } from '../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Spinner,
} from '../components/ui'

const STATUSES: StudentStatus[] = ['ACTIVE', 'PAUSED', 'INACTIVE', 'COMPLETED', 'LEFT']

export function StudentsPage() {
  const [statusFilter, setStatusFilter] = useState<StudentStatus | ''>('ACTIVE')
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const studentsQuery = useQuery({
    queryKey: ['students', statusFilter],
    queryFn: () => studentsApi.list(statusFilter || undefined),
  })

  return (
    <div>
      <PageHeader
        title="Oʻquvchilar"
        description="Hozir yoki avval oʻqigan barcha oʻquvchilar"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Yangi oʻquvchi
          </Button>
        }
      />

      <div className="mb-4 flex gap-2">
        {(['', ...STATUSES] as const).map((status) => (
          <button
            key={status || 'ALL'}
            onClick={() => setStatusFilter(status)}
            className={`rounded-full px-3 py-1 text-xs font-medium ${
              statusFilter === status
                ? 'bg-brand-600 text-white'
                : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50'
            }`}
          >
            {status ? studentStatusLabel[status] : 'Barchasi'}
          </button>
        ))}
      </div>

      <Card>
        {studentsQuery.isLoading ? (
          <Spinner />
        ) : studentsQuery.data?.length === 0 ? (
          <EmptyState title="Ushbu filtrga mos oʻquvchi topilmadi" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {studentsQuery.data?.map((student) => (
              <li key={student.id}>
                <Link
                  to={`/students/${student.id}`}
                  className="flex items-center justify-between px-5 py-3 transition-colors hover:bg-slate-50"
                >
                  <span className="text-sm font-medium text-slate-900">
                    {student.firstName} {student.lastName}
                  </span>
                  <Badge tone={studentStatusTone[student.status]}>{studentStatusLabel[student.status]}</Badge>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {showCreate && (
        <CreateStudentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['students'] })
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}

function CreateStudentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dob, setDob] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => studentsApi.create({ firstName, lastName, dob, phone: phone || undefined }),
    onSuccess: onCreated,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Oʻquvchi yaratib boʻlmadi"),
  })

  return (
    <Modal title="Yangi oʻquvchi" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          createMutation.mutate()
        }}
        className="space-y-4"
      >
        {error && <ErrorBanner message={error} />}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Ism">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </Field>
          <Field label="Familiya">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </Field>
        </div>

        <Field label="Tugʻilgan sana">
          <Input type="date" value={dob} onChange={(e) => setDob(e.target.value)} required />
        </Field>

        <Field label="Telefon (ixtiyoriy)">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Oʻquvchi yaratish
          </Button>
        </div>
      </form>
    </Modal>
  )
}
