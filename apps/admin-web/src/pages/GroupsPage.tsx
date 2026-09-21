import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Clock, Plus, Users } from 'lucide-react'
import { groups as groupsApi, levels as levelsApi, subjects as subjectsApi, teachers as teachersApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { buildAccentMap, dayLabel, initials, type Accent } from '../lib/format'
import { notifyError, notifySuccess } from '../lib/toast'
import type { Group } from '../lib/types'
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '../components/ui'

function levelKey(group: Group): string {
  return group.level?.name ?? group.levelId
}

const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

export function GroupsPage() {
  const { actor } = useAuth()
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)

  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })

  const levelAccents = useMemo(
    () => buildAccentMap((groupsQuery.data ?? []).map(levelKey)),
    [groupsQuery.data],
  )

  if (groupsQuery.isLoading) return <Spinner />

  const groupCount = groupsQuery.data?.length ?? 0

  return (
    <div>
      <PageHeader
        title="Guruhlar"
        description={
          groupCount > 0
            ? `Markazda hozirda faoliyat yuritayotgan ${groupCount} ta guruh`
            : 'Markazda hozirda faoliyat yuritayotgan barcha guruhlar'
        }
        actions={
          actor?.role === 'ADMIN' && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Yangi guruh
            </Button>
          )
        }
      />

      {groupCount === 0 ? (
        <Card>
          <EmptyState title="Hozircha guruhlar yoʻq" description="Boshlash uchun birinchi guruhni yarating." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {groupsQuery.data?.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              accent={levelAccents.get(levelKey(group)) ?? levelAccents.values().next().value!}
            />
          ))}
        </div>
      )}

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

function GroupCard({ group, accent }: { group: Group; accent: Accent }) {
  const studentCount = group.enrollments?.length ?? 0

  return (
    <Link
      to={`/groups/${group.id}`}
      className="group relative flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
    >
      <span className={`absolute inset-x-0 top-0 h-1.5 ${accent.bar}`} />

      <div className="flex flex-1 flex-col gap-4 p-5 pt-6">
        <div className="flex items-start justify-between gap-3">
          <div className="min-w-0">
            <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{group.name}</h3>
            {group.level?.name && (
              <span
                className={`mt-1.5 inline-flex items-center rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${accent.badge}`}
              >
                {group.level.name}
              </span>
            )}
          </div>
          <span className="inline-flex shrink-0 items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
            <Users className="h-3.5 w-3.5" />
            {studentCount}
          </span>
        </div>

        <div className="flex items-center justify-between gap-3">
          <div className="flex min-w-0 items-center gap-2">
            <span
              className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold ${accent.avatar}`}
            >
              {initials(group.teacher?.fullName)}
            </span>
            <span className="truncate text-sm text-slate-600 dark:text-slate-400">
              {group.teacher?.fullName ?? '—'}
            </span>
          </div>

          <div className={`flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5 ring-1 ring-inset ${accent.badge}`}>
            <Clock className="h-4 w-4" />
            <span className="text-xl font-extrabold tabular-nums leading-none">{group.scheduleTime}</span>
          </div>
        </div>

        <div className="mt-auto grid grid-cols-7 gap-1 pt-1">
          {WEEKDAYS.map((day) => {
            const active = group.scheduleDays.includes(day)
            return (
              <span
                key={day}
                className={`flex h-7 items-center justify-center rounded-md text-[10px] font-bold transition-colors ${
                  active
                    ? `${accent.dayActive} shadow-sm`
                    : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                }`}
              >
                {dayLabel[day]}
              </span>
            )
          })}
        </div>
      </div>

      <div className="flex items-center justify-end gap-1 border-t border-slate-100 px-5 py-2 text-xs font-medium text-slate-400 opacity-0 transition-opacity group-hover:opacity-100 dark:border-slate-800 dark:text-slate-500">
        Batafsil <ArrowRight className="h-3 w-3" />
      </div>
    </Link>
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
    onSuccess: () => {
      notifySuccess('Guruh yaratildi')
      onCreated()
    },
    onError: (err) => notifyError(err, 'Guruh yaratib boʻlmadi'),
  })

  function toggleDay(day: string) {
    setScheduleDays((prev) => (prev.includes(day) ? prev.filter((d) => d !== day) : [...prev, day]))
  }

  return (
    <Modal title="Yangi guruh" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          createMutation.mutate()
        }}
        className="space-y-4"
      >
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
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Dars kunlari</span>
          <div className="flex flex-wrap gap-2">
            {WEEKDAYS.map((day) => (
              <button
                type="button"
                key={day}
                onClick={() => toggleDay(day)}
                className={`rounded-lg border px-2.5 py-1 text-xs font-medium ${
                  scheduleDays.includes(day)
                    ? 'border-brand-600 dark:border-brand-400 bg-brand-50 dark:bg-brand-500/10 text-brand-700 dark:text-brand-300'
                    : 'border-slate-300 dark:border-slate-600 text-slate-600 dark:text-slate-400 hover:bg-slate-50 dark:hover:bg-slate-800/60'
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
