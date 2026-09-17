import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus } from 'lucide-react'
import { groups as groupsApi, levels as levelsApi, subjects as subjectsApi, teachers as teachersApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { ApiError } from '../lib/api'
import { dayLabel, formatScheduleDays } from '../lib/format'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui'

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export function GroupsPage() {
  const { actor } = useAuth()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })

  if (groupsQuery.isLoading) return <Spinner />

  return (
    <div>
      <PageHeader
        title="Guruhlar"
        description="Markazda hozirda faoliyat yuritayotgan barcha guruhlar"
        actions={
          actor?.role === 'ADMIN' && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Yangi guruh
            </Button>
          )
        }
      />

      <Card>
        {groupsQuery.data?.length === 0 ? (
          <EmptyState title="Hozircha guruhlar yoʻq" description="Boshlash uchun birinchi guruhni yarating." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {groupsQuery.data?.map((group) => (
              <li key={group.id}>
                <Link
                  to={`/groups/${group.id}`}
                  className="flex items-center justify-between px-5 py-4 transition-colors hover:bg-slate-50"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{group.name}</p>
                    <p className="text-xs text-slate-500">
                      {group.level?.name} · {group.teacher?.fullName} · {formatScheduleDays(group.scheduleDays)}{' '}
                      soat {group.scheduleTime} da
                    </p>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {showCreate && (
        <CreateGroupModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['groups'] })
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}

function CreateGroupModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [subjectId, setSubjectId] = useState('')
  const [levelId, setLevelId] = useState('')
  const [teacherId, setTeacherId] = useState('')
  const [name, setName] = useState('')
  const [scheduleDays, setScheduleDays] = useState<string[]>([])
  const [scheduleTime, setScheduleTime] = useState('18:00')
  const [startDate, setStartDate] = useState('')
  const [error, setError] = useState<string | null>(null)

  const subjectsQuery = useQuery({ queryKey: ['subjects'], queryFn: subjectsApi.list })
  const levelsQuery = useQuery({
    queryKey: ['levels', subjectId],
    queryFn: () => levelsApi.list(),
    enabled: true,
  })
  const teachersQuery = useQuery({ queryKey: ['teachers'], queryFn: teachersApi.list })

  const levelsForSubject = (levelsQuery.data ?? []).filter((level) => {
    const course = subjectsQuery.data
      ?.flatMap((s) => s.courses ?? [])
      .find((c) => c.id === level.courseId)
    return !subjectId || course?.subjectId === subjectId
  })

  const createMutation = useMutation({
    mutationFn: () =>
      groupsApi.create({ levelId, teacherId, name, scheduleDays, scheduleTime, startDate }),
    onSuccess: onCreated,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Guruh yaratib boʻlmadi'),
  })

  function toggleDay(day: string) {
    setScheduleDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  return (
    <Modal title="Yangi guruh" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          createMutation.mutate()
        }}
        className="space-y-4"
      >
        {error && <ErrorBanner message={error} />}

        <Field label="Nomi">
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Oʻrta daraja 02" />
        </Field>

        <Field label="Fan">
          <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
            <option value="">Barcha fanlar</option>
            {subjectsQuery.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Daraja">
          <Select value={levelId} onChange={(e) => setLevelId(e.target.value)} required>
            <option value="">Darajani tanlang</option>
            {levelsForSubject.map((l) => (
              <option key={l.id} value={l.id}>
                {l.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Oʻqituvchi">
          <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
            <option value="">Oʻqituvchini tanlang</option>
            {teachersQuery.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Dars kunlari</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <button
                type="button"
                key={day}
                onClick={() => toggleDay(day)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  scheduleDays.includes(day)
                    ? 'border-brand-600 bg-brand-50 text-brand-700'
                    : 'border-slate-300 text-slate-600 hover:bg-slate-50'
                }`}
              >
                {dayLabel[day]}
              </button>
            ))}
          </div>
        </div>

        <Field label="Vaqt">
          <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} required />
        </Field>

        <Field label="Boshlanish sanasi">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={createMutation.isPending} disabled={scheduleDays.length === 0}>
            Guruh yaratish
          </Button>
        </div>
      </form>
    </Modal>
  )
}
