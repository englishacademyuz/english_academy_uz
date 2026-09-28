import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Plus, School, UserRound, Users } from 'lucide-react'
import { groups as groupsApi, teachers as teachersApi } from '../lib/api'
import { levelStyles, tint } from '../lib/levelColor'
import { notifyError, notifySuccess } from '../lib/toast'
import type { Group, Teacher } from '../lib/types'
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Spinner } from '../components/ui'

// A teacher with no groups yet still gets a color -- picked from their id so it never changes.
const NEUTRAL_COLORS = ['#6366f1', '#0ea5e9', '#14b8a6', '#8b5cf6', '#f59e0b', '#ec4899']

function fallbackColor(id: string) {
  let hash = 0
  for (const ch of id) hash = (hash * 31 + ch.charCodeAt(0)) >>> 0
  return NEUTRAL_COLORS[hash % NEUTRAL_COLORS.length]
}

export function TeachersPage() {
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()
  const teachersQuery = useQuery({ queryKey: ['teachers'], queryFn: teachersApi.list })
  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })

  const groupsByTeacher = useMemo(() => {
    const map = new Map<string, Group[]>()
    for (const g of groupsQuery.data ?? []) map.set(g.teacherId, [...(map.get(g.teacherId) ?? []), g])
    return map
  }, [groupsQuery.data])

  return (
    <div>
      <PageHeader
        title="Oʻqituvchilar"
        description="Tizimga kirib guruhlarni boshqaradigan xodimlar"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Yangi oʻqituvchi
          </Button>
        }
      />

      {teachersQuery.isLoading ? (
        <Spinner />
      ) : teachersQuery.data?.length === 0 ? (
        <Card>
          <EmptyState title="Hali oʻqituvchilar yoʻq" />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          {teachersQuery.data?.map((teacher) => (
            <TeacherCard key={teacher.id} teacher={teacher} groups={groupsByTeacher.get(teacher.id) ?? []} />
          ))}
        </div>
      )}

      {showCreate && (
        <CreateTeacherModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] })
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}

/** A vertical card: a big teacher icon on a panel in the color of their first group's level, then name and groups. */
function TeacherCard({ teacher, groups }: { teacher: Teacher; groups: Group[] }) {
  const color = groups[0]?.level?.color ?? fallbackColor(teacher.id)
  const studentCount = groups.reduce((sum, g) => sum + (g.enrollments?.length ?? 0), 0)

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
      <div
        className="relative flex h-36 items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${tint(color, 0.22)}, ${tint(color, 0.06)})` }}
      >
        <span
          className="flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg ring-4 ring-white dark:ring-slate-900"
          style={{ background: `linear-gradient(135deg, ${color}, ${tint(color, 0.75)})` }}
        >
          <UserRound className="h-12 w-12" strokeWidth={1.75} />
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center gap-3 px-4 pb-5 pt-4 text-center">
        <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{teacher.fullName}</h3>

        <div className="flex items-center gap-4 text-xs text-slate-500 dark:text-slate-400">
          <span className="flex items-center gap-1">
            <School className="h-3.5 w-3.5" /> {groups.length} guruh
          </span>
          <span className="flex items-center gap-1">
            <Users className="h-3.5 w-3.5" /> {studentCount} oʻquvchi
          </span>
        </div>

        {groups.length > 0 ? (
          <div className="flex flex-wrap justify-center gap-1.5">
            {groups.map((g) => {
              const accent = levelStyles(g.level?.color)
              return (
                <Link
                  key={g.id}
                  to={`/groups/${g.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold hover:opacity-80"
                  style={accent.soft}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={accent.fill} />
                  {g.name}
                </Link>
              )
            })}
          </div>
        ) : (
          <span className="text-xs text-slate-400 dark:text-slate-500">Hali guruh biriktirilmagan</span>
        )}
      </div>
    </div>
  )
}

function CreateTeacherModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const createMutation = useMutation({
    mutationFn: () => teachersApi.create({ fullName, username, password }),
    onSuccess: () => {
      notifySuccess("Oʻqituvchi yaratildi")
      onCreated()
    },
    onError: (err) => notifyError(err, "Oʻqituvchi yaratib boʻlmadi"),
  })

  return (
    <Modal title="Yangi oʻqituvchi" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          createMutation.mutate()
        }}
        className="space-y-4"
      >
        <Field label="Toʻliq ism">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Foydalanuvchi nomi">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
        </Field>
        <Field label="Parol">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Oʻqituvchi yaratish
          </Button>
        </div>
      </form>
    </Modal>
  )
}
