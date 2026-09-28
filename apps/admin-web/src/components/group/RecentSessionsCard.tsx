import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Pencil } from 'lucide-react'
import { sessions as sessionsApi } from '../../lib/api'
import { formatDate, toDateInputValue } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Group, LessonSession } from '../../lib/types'
import { MaterialGallery, materialLook } from '../shared/MaterialPreview'
import { MaterialsEditor, type MaterialDraft } from '../shared/MaterialsEditor'
import { Button, Card, EmptyState, Spinner } from '../ui'

export function RecentSessionsCard({ group }: { group: Group }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editingId, setEditingId] = useState<string | null>(null)
  const sessionsQuery = useQuery({
    queryKey: ['group-sessions', group.id, 'all'],
    queryFn: () => sessionsApi.listForGroup(group.id),
  })

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Soʻnggi darslar</h2>

      {sessionsQuery.isLoading ? (
        <Spinner />
      ) : sessionsQuery.data?.length === 0 ? (
        <EmptyState title="Hali darslar qayd etilmagan" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {sessionsQuery.data?.map((session) => {
            const expanded = expandedId === session.id
            const editing = editingId === session.id
            return (
              <li key={session.id}>
                <div className="flex items-center gap-2">
                  <button
                    onClick={() => {
                      setExpandedId(expanded ? null : session.id)
                      if (expanded) setEditingId(null)
                    }}
                    className="flex min-w-0 flex-1 items-center justify-between gap-3 py-3 text-left"
                  >
                    <div className="min-w-0">
                      <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                        {formatDate(session.date)} — {session.topic || 'Mavzu kiritilmagan'}
                      </p>
                      <div className="mt-1 flex flex-wrap gap-1">
                        {session.materials.length > 0 ? (
                          <SourceIcons materials={session.materials} />
                        ) : (
                          <span className="text-xs text-slate-400 dark:text-slate-500">Manba yoʻq</span>
                        )}
                      </div>
                    </div>
                    {expanded ? (
                      <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                    ) : (
                      <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                    )}
                  </button>
                  <button
                    title="Manbalarni tahrirlash"
                    onClick={() => {
                      setExpandedId(session.id)
                      setEditingId(editing ? null : session.id)
                    }}
                    className={`rounded-lg p-2 hover:bg-slate-100 dark:hover:bg-slate-800 ${
                      editing ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'
                    }`}
                  >
                    <Pencil className="h-4 w-4" />
                  </button>
                </div>

                {expanded && (
                  <div className="pb-4">
                    {editing ? (
                      <SourcesEditor group={group} session={session} onDone={() => setEditingId(null)} />
                    ) : (
                      <LessonSources session={session} />
                    )}
                  </div>
                )}
              </li>
            )
          })}
        </ul>
      )}
    </Card>
  )
}

/** Adds sources found after the lesson; saves only the materials, leaving topic/homework/attendance as they are. */
function SourcesEditor({ group, session, onDone }: { group: Group; session: LessonSession; onDone: () => void }) {
  const queryClient = useQueryClient()
  const [materials, setMaterials] = useState<MaterialDraft[]>(
    session.materials.map((m) => ({ type: m.type, content: m.content })),
  )

  const saveMutation = useMutation({
    mutationFn: () => sessionsApi.record(group.id, { date: toDateInputValue(new Date(session.date)), materials }),
    onSuccess: () => {
      notifySuccess('Manbalar saqlandi')
      queryClient.invalidateQueries({ queryKey: ['group-sessions', group.id] })
      onDone()
    },
    onError: (err) => notifyError(err, 'Manbalarni saqlab boʻlmadi'),
  })

  return (
    <div className="space-y-3 rounded-lg border border-slate-200 p-4 dark:border-slate-700">
      <MaterialsEditor value={materials} onChange={setMaterials} />
      <div className="flex justify-end gap-2">
        <Button variant="secondary" size="sm" onClick={onDone}>
          Bekor qilish
        </Button>
        <Button size="sm" loading={saveMutation.isPending} onClick={() => saveMutation.mutate()}>
          Saqlash
        </Button>
      </div>
    </div>
  )
}

function LessonSources({ session }: { session: LessonSession }) {
  if (session.materials.length === 0 && !session.homework) {
    return (
      <p className="rounded-lg bg-slate-50 dark:bg-slate-800/60 p-4 text-xs text-slate-500 dark:text-slate-400">
        Bu dars uchun manbalar kiritilmagan. Qoʻshish uchun ✏️ tugmasini bosing.
      </p>
    )
  }

  return (
    <div className="space-y-3 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-4">
      {session.materials.length > 0 && (
        <MaterialGallery materials={session.materials} />
      )}
      {session.homework && (
        <p className="text-xs text-slate-500 dark:text-slate-400">Uy vazifasi: {session.homework.instructions}</p>
      )}
    </div>
  )
}

/** One small colored icon per source -- enough to see "2 videos, 1 doc" at a glance. */
function SourceIcons({ materials }: { materials: LessonSession['materials'] }) {
  return (
    <span className="flex items-center gap-1">
      {materials.map((m) => {
        const look = materialLook(m)
        const Icon = look.icon
        return (
          <span
            key={m.id}
            title={look.label}
            className={`flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br text-white ${look.tile}`}
          >
            <Icon className={`h-3 w-3 ${look.kind === 'youtube' ? 'fill-current' : ''}`} />
          </span>
        )
      })}
    </span>
  )
}
