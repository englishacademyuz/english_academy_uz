import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, Camera, Clock, Pencil, Plus, Trash2, Users } from 'lucide-react'
import { groups as groupsApi, homeworkSubmissions as submissionsApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dayLabel, initials } from '../lib/format'
import { levelStyles } from '../lib/levelColor'
import type { Group } from '../lib/types'
import { Button, Card, EmptyState, PageHeader, Spinner } from '../components/ui'
import { DeleteGroupModal, GroupFormModal, WEEKDAYS } from '../components/group/GroupFormModal'

export function GroupsPage() {
  const { actor } = useAuth()
  const isAdmin = actor?.role === 'ADMIN'
  const queryClient = useQueryClient()
  const [showCreate, setShowCreate] = useState(false)
  const [editing, setEditing] = useState<Group | null>(null)
  const [deleting, setDeleting] = useState<Group | null>(null)
  const [levelFilter, setLevelFilter] = useState<string | null>(null)

  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const unchecked = useQuery({ queryKey: ['homework-unchecked'], queryFn: submissionsApi.unchecked })

  // Each level present, in first-appearance order -- doubles as the color legend and a filter.
  const levels = useMemo(() => {
    const seen = new Map<string, { id: string; name: string; color: string; count: number }>()
    for (const g of groupsQuery.data ?? []) {
      if (!g.level) continue
      const entry = seen.get(g.level.id) ?? { id: g.level.id, name: g.level.name, color: g.level.color, count: 0 }
      entry.count += 1
      seen.set(g.level.id, entry)
    }
    return [...seen.values()]
  }, [groupsQuery.data])

  if (groupsQuery.isLoading) return <Spinner />

  const all = groupsQuery.data ?? []
  const visible = levelFilter ? all.filter((g) => g.levelId === levelFilter) : all

  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['groups'] })
    queryClient.invalidateQueries({ queryKey: ['group'] })
  }

  return (
    <div>
      <PageHeader
        title="Guruhlar"
        description={
          all.length > 0
            ? `Markazda hozirda faoliyat yuritayotgan ${all.length} ta guruh`
            : 'Markazda hozirda faoliyat yuritayotgan barcha guruhlar'
        }
        actions={
          isAdmin && (
            <Button onClick={() => setShowCreate(true)}>
              <Plus className="h-4 w-4" /> Yangi guruh
            </Button>
          )
        }
      />

      {levels.length > 1 && (
        <div className="mb-5 flex flex-wrap items-center gap-2">
          <button
            onClick={() => setLevelFilter(null)}
            className={`rounded-full px-3 py-1.5 text-xs font-semibold transition-colors ${
              levelFilter === null
                ? 'bg-slate-900 text-white dark:bg-white dark:text-slate-900'
                : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700'
            }`}
          >
            Barchasi · {all.length}
          </button>
          {levels.map((level) => {
            const styles = levelStyles(level.color)
            const active = levelFilter === level.id
            return (
              <button
                key={level.id}
                onClick={() => setLevelFilter(active ? null : level.id)}
                style={active ? styles.solid : styles.soft}
                className="inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold transition-transform hover:-translate-y-px"
              >
                <span className="h-2 w-2 rounded-full" style={active ? { backgroundColor: '#fff' } : styles.fill} />
                {level.name} · {level.count}
              </button>
            )
          })}
        </div>
      )}

      {visible.length === 0 ? (
        <Card>
          <EmptyState title="Hozircha guruhlar yoʻq" description="Boshlash uchun birinchi guruhni yarating." />
        </Card>
      ) : (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 xl:grid-cols-3">
          {visible.map((group) => (
            <GroupCard
              key={group.id}
              group={group}
              uncheckedHomework={unchecked.data?.byGroup[group.id] ?? 0}
              onEdit={isAdmin ? () => setEditing(group) : undefined}
              onDelete={isAdmin ? () => setDeleting(group) : undefined}
            />
          ))}
        </div>
      )}

      {(showCreate || editing) && (
        <GroupFormModal
          group={editing ?? undefined}
          onClose={() => {
            setShowCreate(false)
            setEditing(null)
          }}
          onSaved={() => {
            refresh()
            setShowCreate(false)
            setEditing(null)
          }}
        />
      )}
      {deleting && <DeleteGroupModal group={deleting} onClose={() => setDeleting(null)} onDeleted={() => setDeleting(null)} />}
    </div>
  )
}

function GroupCard({
  group,
  uncheckedHomework,
  onEdit,
  onDelete,
}: {
  group: Group
  /** Homework submissions waiting for the teacher. */
  uncheckedHomework: number
  onEdit?: () => void
  onDelete?: () => void
}) {
  const studentCount = group.enrollments?.length ?? 0
  const accent = levelStyles(group.level?.color)

  return (
    <div className="group relative">
      <Link
        to={`/groups/${group.id}`}
        className="relative flex h-full flex-col overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-lg dark:border-slate-800 dark:bg-slate-900"
      >
        <span className="absolute inset-x-0 top-0 h-1.5" style={accent.fill} />

        <div className="flex flex-1 flex-col gap-4 p-5 pt-6">
          <div className="flex items-start justify-between gap-3">
            <div className="min-w-0">
              <h3 className="truncate text-base font-semibold text-slate-900 dark:text-slate-100">{group.name}</h3>
              {group.level?.name && (
                <span
                  className="mt-1.5 inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={accent.soft}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={accent.fill} />
                  {group.level.name}
                </span>
              )}
            </div>
            <span className="flex shrink-0 items-center gap-1.5">
              {uncheckedHomework > 0 && (
                <span
                  title="Tekshirilmagan uyga vazifalar"
                  className="inline-flex items-center gap-1 rounded-full bg-amber-100 px-2.5 py-1 text-xs font-semibold text-amber-800 dark:bg-amber-500/15 dark:text-amber-300"
                >
                  <Camera className="h-3.5 w-3.5" />
                  {uncheckedHomework}
                </span>
              )}
              <span className="inline-flex items-center gap-1.5 rounded-full bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800 dark:text-slate-300">
                <Users className="h-3.5 w-3.5" />
                {studentCount}
              </span>
            </span>
          </div>

          <div className="flex items-center justify-between gap-3">
            <div className="flex min-w-0 items-center gap-2">
              <span
                className="flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-[11px] font-semibold"
                style={accent.soft}
              >
                {initials(group.teacher?.fullName)}
              </span>
              <span className="truncate text-sm text-slate-600 dark:text-slate-400">{group.teacher?.fullName ?? '—'}</span>
            </div>

            <div className="flex shrink-0 items-center gap-1.5 rounded-lg px-3 py-1.5" style={accent.soft}>
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
                  style={active ? accent.solid : undefined}
                  className={`flex h-7 items-center justify-center rounded-md text-[10px] font-bold ${
                    active ? 'shadow-sm' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
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

      {(onEdit || onDelete) && (
        // Outside the <Link> so a click here never navigates.
        <div className="absolute bottom-1.5 left-3 flex gap-1 opacity-0 transition-opacity focus-within:opacity-100 group-hover:opacity-100">
          {onEdit && (
            <button
              onClick={onEdit}
              title="Tahrirlash"
              className="rounded-md p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-700 dark:hover:bg-slate-800 dark:hover:text-slate-200"
            >
              <Pencil className="h-3.5 w-3.5" />
            </button>
          )}
          {onDelete && (
            <button
              onClick={onDelete}
              title="Oʻchirish"
              className="rounded-md p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 dark:hover:bg-red-500/10 dark:hover:text-red-400"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </button>
          )}
        </div>
      )}
    </div>
  )
}
