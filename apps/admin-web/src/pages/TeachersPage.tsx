import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Pencil, Phone, Plus, School, UserRound, Users } from 'lucide-react'
import { groups as groupsApi, teachers as teachersApi } from '../lib/api'
import { telHref } from '../lib/format'
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
  const [editing, setEditing] = useState<Teacher | null>(null)
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
            <TeacherCard
              key={teacher.id}
              teacher={teacher}
              groups={groupsByTeacher.get(teacher.id) ?? []}
              onEdit={() => setEditing(teacher)}
            />
          ))}
        </div>
      )}

      {showCreate && (
        <TeacherFormModal
          onClose={() => setShowCreate(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] })
            setShowCreate(false)
          }}
        />
      )}
      {editing && (
        <TeacherFormModal
          teacher={editing}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] })
            // Group payloads embed the teacher, so their cached copies are stale too.
            queryClient.invalidateQueries({ queryKey: ['groups'] })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}

/** A vertical card: a big teacher icon on a panel in the color of their first group's level, then name and groups. */
function TeacherCard({ teacher, groups, onEdit }: { teacher: Teacher; groups: Group[]; onEdit: () => void }) {
  const color = groups[0]?.level?.color ?? fallbackColor(teacher.id)
  const studentCount = groups.reduce((sum, g) => sum + (g.enrollments?.length ?? 0), 0)

  return (
    <div className="flex flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900">
      <div
        className="relative flex h-36 items-center justify-center"
        style={{ background: `linear-gradient(135deg, ${tint(color, 0.22)}, ${tint(color, 0.06)})` }}
      >
        <button
          type="button"
          onClick={onEdit}
          className="absolute right-2 top-2 rounded-lg bg-white/80 p-1.5 text-slate-500 hover:bg-white hover:text-slate-800 dark:bg-slate-900/70 dark:text-slate-400 dark:hover:bg-slate-900 dark:hover:text-slate-100"
          aria-label="Oʻqituvchini tahrirlash"
          title="Tahrirlash"
        >
          <Pencil className="h-4 w-4" />
        </button>
        <span
          className="flex h-24 w-24 items-center justify-center rounded-full text-white shadow-lg ring-4 ring-white dark:ring-slate-900"
          style={{ background: `linear-gradient(135deg, ${color}, ${tint(color, 0.75)})` }}
        >
          <UserRound className="h-12 w-12" strokeWidth={1.75} />
        </span>
      </div>

      <div className="flex flex-1 flex-col items-center gap-3 px-4 pb-5 pt-4 text-center">
        <div className="flex flex-col items-center gap-0.5">
          <h3 className="text-base font-semibold text-slate-900 dark:text-slate-100">{teacher.fullName}</h3>
          {teacher.phone ? (
            <a
              href={telHref(teacher.phone)}
              className="inline-flex items-center gap-1 text-xs text-slate-500 hover:text-brand-600 dark:text-slate-400 dark:hover:text-brand-400"
            >
              <Phone className="h-3 w-3" /> {teacher.phone}
            </a>
          ) : (
            <button type="button" onClick={onEdit} className="text-xs text-slate-400 hover:text-brand-600 dark:text-slate-500">
              + Telefon raqam qoʻshish
            </button>
          )}
        </div>

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


/** Creates a teacher (with their login), or edits an existing one's name and phone with `teacher`. */
function TeacherFormModal({ teacher, onClose, onSaved }: { teacher?: Teacher; onClose: () => void; onSaved: () => void }) {
  const editing = !!teacher
  const [fullName, setFullName] = useState(teacher?.fullName ?? '')
  const [phone, setPhone] = useState(teacher?.phone ?? '')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const saveMutation = useMutation({
    mutationFn: () =>
      teacher
        ? teachersApi.update(teacher.id, { fullName, phone })
        : teachersApi.create({ fullName, username, password, phone }),
    onSuccess: () => {
      notifySuccess(editing ? 'Oʻqituvchi maʼlumotlari yangilandi' : 'Oʻqituvchi yaratildi')
      onSaved()
    },
    onError: (err) => notifyError(err, editing ? 'Maʼlumotlarni saqlab boʻlmadi' : 'Oʻqituvchi yaratib boʻlmadi'),
  })

  return (
    <Modal title={editing ? 'Oʻqituvchini tahrirlash' : 'Yangi oʻqituvchi'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          saveMutation.mutate()
        }}
        className="space-y-4"
      >
        <Field label="Toʻliq ism">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <div>
          <Field label="Telefon raqam">
            <Input
              type="tel"
              value={phone}
              onChange={(e) => setPhone(e.target.value)}
              placeholder="+998 90 123 45 67"
              required={!editing}
            />
          </Field>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Oʻquvchilar uni Telegram ilovasida koʻradi va bir bosishda qoʻngʻiroq qila oladi.
          </p>
        </div>
        {!editing && (
          <>
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
          </>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={saveMutation.isPending}>
            {editing ? 'Saqlash' : 'Oʻqituvchi yaratish'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
