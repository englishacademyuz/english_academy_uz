import { useEffect, useState, type FormEvent, type ReactNode } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronRight, Pencil, Plus, Star, Trash2, X } from 'lucide-react'
import { pointsForPercentage } from '@tashkurgan/shared/points'
import {
  ApiError,
  assessmentCategories as categoriesApi,
  courses as coursesApi,
  levels as levelsApi,
  subjects as subjectsApi,
} from '../lib/api'
import { notifyError, notifySuccess } from '../lib/toast'
import { Badge, Button, Card, Input, PageHeader, Spinner, Tabs } from '../components/ui'
import { assessmentCategoryCadenceLabel } from '../lib/format'
import type { AssessmentCategory, AssessmentCategoryCadence } from '../lib/types'

function InlineAddForm({
  placeholder,
  onSubmit,
  pending,
}: {
  placeholder: string
  onSubmit: (value: string) => void
  pending: boolean
}) {
  const [value, setValue] = useState('')
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    onSubmit(value.trim())
    setValue('')
  }
  return (
    <form onSubmit={handleSubmit} className="flex gap-2">
      <Input value={value} onChange={(e) => setValue(e.target.value)} placeholder={placeholder} className="text-sm" />
      <Button type="submit" variant="secondary" loading={pending}>
        <Plus className="h-4 w-4" />
      </Button>
    </form>
  )
}

type CurriculumKind = 'subject' | 'course' | 'level'
const curriculumApi = { subject: subjectsApi, course: coursesApi, level: levelsApi }
const isConflict = (err: unknown) => err instanceof ApiError && err.statusCode === 409

function InlineRenameForm({
  initial,
  onSubmit,
  onCancel,
}: {
  initial: string
  onSubmit: (value: string) => void
  onCancel: () => void
}) {
  const [value, setValue] = useState(initial)
  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!value.trim()) return
    onSubmit(value.trim())
  }
  return (
    <form onSubmit={handleSubmit} className="flex gap-1 py-0.5">
      <Input
        autoFocus
        value={value}
        onChange={(e) => setValue(e.target.value)}
        onKeyDown={(e) => e.key === 'Escape' && onCancel()}
        className="text-sm"
      />
      <Button type="submit" variant="secondary" title="Saqlash">
        <Check className="h-4 w-4" />
      </Button>
      <Button type="button" variant="secondary" onClick={onCancel} title="Bekor qilish">
        <X className="h-4 w-4" />
      </Button>
    </form>
  )
}

/** One of the three master columns (Fanlar / Kurslar / Darajalar). Presentation only --
 selection state lives in the parent so the three columns and the detail panel stay in sync. */
function NavColumn({
  title,
  items,
  selectedId,
  onSelect,
  getCount,
  addPlaceholder,
  onAdd,
  addPending,
  emptyLabel,
  onRename,
  onDelete,
  deleteConfirm,
}: {
  title: string
  items: Array<{ id: string; name: string; color?: string }>
  selectedId: string | null
  onSelect: (id: string) => void
  getCount?: (id: string) => number | undefined
  addPlaceholder: string
  onAdd: (name: string) => void
  addPending: boolean
  emptyLabel: string
  onRename: (id: string, name: string) => void
  onDelete: (id: string) => void
  deleteConfirm: (name: string) => string
}) {
  const [editingId, setEditingId] = useState<string | null>(null)

  return (
    <Card className="flex flex-col p-0">
      <div className="flex items-center justify-between px-4 pt-4 pb-2">
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
          {title}
        </span>
        <span className="flex h-5 min-w-5 items-center justify-center rounded-full bg-slate-100 px-1.5 text-[11px] font-semibold text-slate-500 dark:bg-slate-800 dark:text-slate-400">
          {items.length}
        </span>
      </div>

      <div className="max-h-72 flex-1 overflow-y-auto px-2 pb-2">
        {items.length === 0 ? (
          <p className="px-2.5 py-3 text-xs text-slate-400 dark:text-slate-500">{emptyLabel}</p>
        ) : (
          <ul className="space-y-0.5">
            {items.map((item) => {
              const active = item.id === selectedId
              const count = getCount?.(item.id)
              if (item.id === editingId) {
                return (
                  <li key={item.id}>
                    <InlineRenameForm
                      initial={item.name}
                      onSubmit={(name) => {
                        if (name !== item.name) onRename(item.id, name)
                        setEditingId(null)
                      }}
                      onCancel={() => setEditingId(null)}
                    />
                  </li>
                )
              }
              return (
                <li key={item.id} className="group relative">
                  <button
                    onClick={() => onSelect(item.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border-l-2 px-2.5 py-2 text-left text-sm transition-colors ${
                      active
                        ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-300'
                        : 'border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="flex min-w-0 items-center gap-2">
                      {item.color && (
                        <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: item.color }} />
                      )}
                      <span className="truncate">{item.name}</span>
                    </span>
                    <span className="flex shrink-0 items-center gap-1">
                      {count !== undefined && (
                        <span
                          className={`text-xs tabular-nums ${
                            active ? 'text-brand-500 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'
                          }`}
                        >
                          {count}
                        </span>
                      )}
                      <ChevronRight
                        className={`h-3.5 w-3.5 ${active ? 'text-brand-400' : 'text-slate-300 dark:text-slate-600'}`}
                      />
                    </span>
                  </button>
                  <div className="absolute inset-y-0 right-7 hidden items-center gap-0.5 rounded-md bg-white/90 px-0.5 group-hover:flex dark:bg-slate-900/90">
                    <button
                      onClick={() => setEditingId(item.id)}
                      title="Tahrirlash"
                      className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
                    >
                      <Pencil className="h-3.5 w-3.5" />
                    </button>
                    <button
                      onClick={() => {
                        if (window.confirm(deleteConfirm(item.name))) onDelete(item.id)
                      }}
                      title="Oʻchirish"
                      className="rounded-md p-1 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                    </button>
                  </div>
                </li>
              )
            })}
          </ul>
        )}
      </div>

      <div className="border-t border-slate-100 p-2 dark:border-slate-800">
        <InlineAddForm placeholder={addPlaceholder} onSubmit={onAdd} pending={addPending} />
      </div>
    </Card>
  )
}

function Breadcrumb({ crumbs }: { crumbs: string[] }) {
  if (crumbs.length === 0) return null
  return (
    <div className="mb-4 flex flex-wrap items-center gap-1.5 text-sm">
      <span className="text-slate-400 dark:text-slate-500">Fanlar</span>
      {crumbs.map((crumb, i) => (
        <span key={i} className="flex items-center gap-1.5">
          <ChevronRight className="h-3.5 w-3.5 text-slate-300 dark:text-slate-600" />
          <span
            className={
              i === crumbs.length - 1
                ? 'font-semibold text-slate-900 dark:text-slate-100'
                : 'text-slate-400 dark:text-slate-500'
            }
          >
            {crumb}
          </span>
        </span>
      ))}
    </div>
  )
}

export function SubjectsPage() {
  const queryClient = useQueryClient()

  const [subjectId, setSubjectId] = useState<string | null>(null)
  const [courseId, setCourseId] = useState<string | null>(null)
  const [levelId, setLevelId] = useState<string | null>(null)

  const subjectsQuery = useQuery({ queryKey: ['subjects'], queryFn: subjectsApi.list })
  const coursesQuery = useQuery({
    queryKey: ['courses', subjectId],
    queryFn: () => coursesApi.list(subjectId ?? undefined),
    enabled: !!subjectId,
  })
  const levelsQuery = useQuery({
    queryKey: ['levels', courseId],
    queryFn: () => levelsApi.list(courseId ?? undefined),
    enabled: !!courseId,
  })

  const levelCategoryQueries = useQueries({
    queries: (levelsQuery.data ?? []).map((level) => ({
      queryKey: ['assessment-categories', level.id],
      queryFn: () => categoriesApi.list(level.id),
    })),
  })
  const levelCategoryCounts = new Map<string, number>()
  ;(levelsQuery.data ?? []).forEach((level, i) => {
    const data = levelCategoryQueries[i]?.data
    if (data) levelCategoryCounts.set(level.id, data.length)
  })

  // Keep a selection alive in every column -- picking a subject/course auto-selects its
  // first child so the detail panel on the right always has something to show, matching
  // how the reference design never leaves the page empty.
  useEffect(() => {
    if (!subjectId && subjectsQuery.data && subjectsQuery.data.length > 0) {
      setSubjectId(subjectsQuery.data[0].id)
    }
  }, [subjectId, subjectsQuery.data])

  useEffect(() => {
    if (!coursesQuery.data) return
    if (!courseId || !coursesQuery.data.some((c) => c.id === courseId)) {
      setCourseId(coursesQuery.data[0]?.id ?? null)
    }
  }, [courseId, coursesQuery.data])

  useEffect(() => {
    if (!levelsQuery.data) return
    if (!levelId || !levelsQuery.data.some((l) => l.id === levelId)) {
      setLevelId(levelsQuery.data[0]?.id ?? null)
    }
  }, [levelId, levelsQuery.data])

  const createSubject = useMutation({
    mutationFn: (name: string) => subjectsApi.create(name),
    onSuccess: (subject) => {
      notifySuccess('Fan yaratildi')
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      setSubjectId(subject.id)
      setCourseId(null)
      setLevelId(null)
    },
    onError: (err) => notifyError(err, 'Fanni yaratib boʻlmadi'),
  })

  const createCourse = useMutation({
    mutationFn: (name: string) => coursesApi.create(subjectId!, name),
    onSuccess: (course) => {
      notifySuccess('Kurs yaratildi')
      queryClient.invalidateQueries({ queryKey: ['courses', subjectId] })
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
      setCourseId(course.id)
      setLevelId(null)
    },
    onError: (err) => notifyError(err, 'Kursni yaratib boʻlmadi'),
  })

  const createLevel = useMutation({
    mutationFn: (name: string) => levelsApi.create(courseId!, name),
    onSuccess: (level) => {
      notifySuccess('Daraja yaratildi')
      queryClient.invalidateQueries({ queryKey: ['levels', courseId] })
      queryClient.invalidateQueries({ queryKey: ['courses', subjectId] })
      setLevelId(level.id)
    },
    onError: (err) => notifyError(err, 'Darajani yaratib boʻlmadi'),
  })

  // Names show up elsewhere too (group cards, filters), so a rename/delete refreshes every
  // curriculum-derived list rather than just this column.
  function refreshCurriculum() {
    for (const key of ['subjects', 'courses', 'levels', 'groups']) {
      queryClient.invalidateQueries({ queryKey: [key] })
    }
  }

  const renameItem = useMutation({
    mutationFn: ({ kind, id, name }: { kind: CurriculumKind; id: string; name: string }) =>
      curriculumApi[kind].rename(id, name),
    onSuccess: () => {
      notifySuccess('Nomi oʻzgartirildi')
      refreshCurriculum()
    },
    onError: (err) =>
      isConflict(err)
        ? notifyError(null, 'Bu nom allaqachon mavjud')
        : notifyError(err, 'Nomini oʻzgartirib boʻlmadi'),
  })

  const deleteItem = useMutation({
    mutationFn: ({ kind, id }: { kind: CurriculumKind; id: string }) => curriculumApi[kind].remove(id),
    onSuccess: (_, { kind, id }) => {
      notifySuccess('Oʻchirildi')
      if (kind === 'subject' && id === subjectId) setSubjectId(null)
      if (kind === 'course' && id === courseId) setCourseId(null)
      if (kind === 'level' && id === levelId) setLevelId(null)
      refreshCurriculum()
    },
    onError: (err) =>
      isConflict(err)
        ? notifyError(null, 'Oʻchirib boʻlmaydi: bu yerda guruhlar oʻqigan yoki oʻqiyapti (arxivdagilari ham)')
        : notifyError(err, 'Oʻchirib boʻlmadi'),
  })

  const selectedSubject = subjectsQuery.data?.find((s) => s.id === subjectId)
  const selectedCourse = coursesQuery.data?.find((c) => c.id === courseId)
  const selectedLevel = levelsQuery.data?.find((l) => l.id === levelId)

  const crumbs = [selectedSubject?.name, selectedCourse?.name, selectedLevel?.name].filter(
    (c): c is string => !!c,
  )

  return (
    <div>
      <PageHeader title="Oʻquv dasturi" description="Fanlar, kurslar, darajalar va baholash toifalari" />
      <Breadcrumb crumbs={crumbs} />

      {subjectsQuery.isLoading ? (
        <Spinner />
      ) : (
        <div className="grid grid-cols-1 gap-4 lg:grid-cols-[1fr_1fr_1fr_1.4fr] lg:items-start">
          <NavColumn
            title="Fanlar"
            items={subjectsQuery.data ?? []}
            selectedId={subjectId}
            onSelect={(id) => {
              setSubjectId(id)
              setCourseId(null)
              setLevelId(null)
            }}
            getCount={(id) => subjectsQuery.data?.find((s) => s.id === id)?.courses?.length}
            addPlaceholder="Yangi fan"
            onAdd={(name) => createSubject.mutate(name)}
            addPending={createSubject.isPending}
            emptyLabel="Hozircha fan yoʻq"
            onRename={(id, name) => renameItem.mutate({ kind: 'subject', id, name })}
            onDelete={(id) => deleteItem.mutate({ kind: 'subject', id })}
            deleteConfirm={(name) =>
              `"${name}" fani oʻchirilsinmi? Uning barcha kurslari, darajalari va baholash toifalari ham oʻchadi.`
            }
          />

          <NavColumn
            title="Kurslar"
            items={coursesQuery.data ?? []}
            selectedId={courseId}
            onSelect={(id) => {
              setCourseId(id)
              setLevelId(null)
            }}
            getCount={(id) => coursesQuery.data?.find((c) => c.id === id)?.levels?.length}
            addPlaceholder="Yangi kurs"
            onAdd={(name) => createCourse.mutate(name)}
            addPending={createCourse.isPending}
            emptyLabel={subjectId ? 'Hozircha kurs yoʻq' : 'Avval fan tanlang'}
            onRename={(id, name) => renameItem.mutate({ kind: 'course', id, name })}
            onDelete={(id) => deleteItem.mutate({ kind: 'course', id })}
            deleteConfirm={(name) =>
              `"${name}" kursi oʻchirilsinmi? Uning barcha darajalari va baholash toifalari ham oʻchadi.`
            }
          />

          <NavColumn
            title="Darajalar"
            items={levelsQuery.data ?? []}
            selectedId={levelId}
            onSelect={setLevelId}
            getCount={(id) => levelCategoryCounts.get(id)}
            addPlaceholder="Yangi daraja"
            onAdd={(name) => createLevel.mutate(name)}
            addPending={createLevel.isPending}
            emptyLabel={courseId ? 'Hozircha daraja yoʻq' : 'Avval kurs tanlang'}
            onRename={(id, name) => renameItem.mutate({ kind: 'level', id, name })}
            onDelete={(id) => deleteItem.mutate({ kind: 'level', id })}
            deleteConfirm={(name) => `"${name}" darajasi oʻchirilsinmi? Uning baholash toifalari ham oʻchadi.`}
          />

          <DetailPanel levelId={levelId} pathLabel={crumbs.join(' · ')} />
        </div>
      )}
    </div>
  )
}

function DetailPanel({ levelId, pathLabel }: { levelId: string | null; pathLabel: string }) {
  const queryClient = useQueryClient()

  const categoriesQuery = useQuery({
    queryKey: ['assessment-categories', levelId],
    queryFn: () => categoriesApi.list(levelId!),
    enabled: !!levelId,
  })

  const createCategory = useMutation({
    mutationFn: ({
      name,
      maxScore,
      pointsWorth,
      cadence,
    }: {
      name: string
      maxScore: number
      pointsWorth: number
      cadence: AssessmentCategoryCadence
    }) => categoriesApi.create(levelId!, name, maxScore, pointsWorth, cadence),
    onSuccess: () => {
      notifySuccess('Toifa yaratildi')
      queryClient.invalidateQueries({ queryKey: ['assessment-categories', levelId] })
    },
    onError: (err) => notifyError(err, 'Toifani yaratib boʻlmadi'),
  })

  const retireCategory = useMutation({
    mutationFn: (id: string) => categoriesApi.retire(id),
    onSuccess: () => {
      notifySuccess('Toifa chetlandi')
      queryClient.invalidateQueries({ queryKey: ['assessment-categories', levelId] })
    },
    onError: (err) => notifyError(err, 'Toifani chetlab boʻlmadi'),
  })

  return (
    <Card className="p-5">
      <div className="mb-4">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Baholash toifalari</h2>
        {pathLabel && <p className="mt-0.5 text-sm text-slate-400 dark:text-slate-500">{pathLabel}</p>}
      </div>

      {!levelId ? (
        <p className="py-8 text-center text-sm text-slate-400 dark:text-slate-500">
          Baholash toifalarini koʻrish uchun daraja tanlang
        </p>
      ) : (
        <div className="space-y-3">
          {categoriesQuery.data?.map((category) => (
            <CategoryCard key={category.id} category={category} onRetire={() => retireCategory.mutate(category.id)} />
          ))}
          {categoriesQuery.data?.length === 0 && (
            <p className="text-sm text-slate-400 dark:text-slate-500">Hozircha baholash toifasi yoʻq</p>
          )}

          <CategoryAddForm
            onSubmit={(name, maxScore, pointsWorth, cadence) =>
              createCategory.mutate({ name, maxScore, pointsWorth, cadence })
            }
            pending={createCategory.isPending}
          />
        </div>
      )}
    </Card>
  )
}

type Scale = 'PERCENT' | 'MARK' | 'CUSTOM'

const SCALES: Array<{ key: Scale; title: string; range: string }> = [
  { key: 'PERCENT', title: 'Foiz', range: '0–100%' },
  { key: 'MARK', title: 'Baho', range: '0–5' },
  { key: 'CUSTOM', title: 'Boshqa', range: 'oʻz maksimali' },
]

const scaleOf = (maxScore: number): Scale => (maxScore === 100 ? 'PERCENT' : maxScore === 5 ? 'MARK' : 'CUSTOM')

const scaleLabel = (maxScore: number) =>
  maxScore === 100 ? 'Foiz · 0–100%' : maxScore === 5 ? 'Baho · 0–5' : `Ball · 0–${maxScore}`

/** Sample results a student might get, from the top down -- the marks themselves on a 0-5 scale, 100/80/60/40/20% of the maximum otherwise. */
function sampleScores(maxScore: number): Array<{ label: string; score: number }> {
  if (maxScore === 5) return [5, 4, 3, 2, 1].map((mark) => ({ label: String(mark), score: mark }))
  return [100, 80, 60, 40, 20].map((pct) => {
    const score = Math.round((maxScore * pct) / 100)
    return { label: maxScore === 100 ? `${pct}%` : `${score}/${maxScore}`, score }
  })
}

const CADENCE_OPTIONS: AssessmentCategoryCadence[] = ['DAILY', 'WEEKLY', 'MONTHLY']

const cadenceHint: Record<AssessmentCategoryCadence, string> = {
  DAILY: 'Har dars kuni jurnalda ustun boʻlib turadi',
  WEEKLY: 'Haftada bir marta — oʻqituvchi ochganda baholanadi',
  MONTHLY: 'Oyda bir marta — oʻqituvchi ochganda baholanadi',
}

/** What a student earns for each sample result -- the same half-point rounding the server applies when marks are saved. */
function PointsPreview({ maxScore, pointsWorth }: { maxScore: number; pointsWorth: number }) {
  return (
    <div className="grid grid-cols-5 gap-1">
      {sampleScores(maxScore).map(({ label, score }) => {
        const points = pointsForPercentage(pointsWorth, (score / maxScore) * 100)
        return (
          <div
            key={label}
            className="rounded-lg bg-white px-1 py-1.5 text-center ring-1 ring-inset ring-slate-200 dark:bg-slate-900 dark:ring-slate-700"
          >
            <p className="truncate text-[11px] text-slate-500 dark:text-slate-400">{label}</p>
            <p
              className={`text-sm font-semibold tabular-nums ${
                points > 0 ? 'text-brand-700 dark:text-brand-300' : 'text-slate-300 dark:text-slate-600'
              }`}
            >
              {points}
            </p>
          </div>
        )
      })}
    </div>
  )
}

function CategoryCard({ category, onRetire }: { category: AssessmentCategory; onRetire: () => void }) {
  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <p className="truncate font-semibold text-slate-900 dark:text-slate-100">{category.name}</p>
          <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{scaleLabel(category.maxScore)}</p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={category.cadence === 'DAILY' ? 'slate' : 'amber'}>
            {assessmentCategoryCadenceLabel[category.cadence]}
          </Badge>
          <button
            onClick={onRetire}
            title="Chetlash uchun bosing"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>

      {category.pointsWorth > 0 ? (
        <div className="mt-3 rounded-lg bg-slate-50 p-2 dark:bg-slate-800/50">
          <p className="mb-1.5 flex items-center gap-1 text-xs text-slate-500 dark:text-slate-400">
            <Star className="h-3.5 w-3.5 text-yellow-500" />
            Maksimal natija uchun{' '}
            <strong className="text-slate-700 dark:text-slate-200">{category.pointsWorth} point</strong>
          </p>
          <PointsPreview maxScore={category.maxScore} pointsWorth={category.pointsWorth} />
        </div>
      ) : (
        <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Reytingga point bermaydi — faqat baho</p>
      )}
    </div>
  )
}

function FormLabel({ children }: { children: ReactNode }) {
  return <p className="mb-1.5 text-xs font-semibold text-slate-600 dark:text-slate-300">{children}</p>
}

function CategoryAddForm({
  onSubmit,
  pending,
}: {
  onSubmit: (name: string, maxScore: number, pointsWorth: number, cadence: AssessmentCategoryCadence) => void
  pending: boolean
}) {
  const [name, setName] = useState('')
  const [cadence, setCadence] = useState<AssessmentCategoryCadence>('DAILY')
  const [maxScore, setMaxScore] = useState(100)
  const [pointsWorth, setPointsWorth] = useState(0)
  // "Boshqa" is remembered on its own -- otherwise typing 100 or 5 as a custom
  // maximum would snap the choice back to Foiz/Baho.
  const [custom, setCustom] = useState(false)
  const scale = custom ? 'CUSTOM' : scaleOf(maxScore)

  function chooseScale(next: Scale) {
    setCustom(next === 'CUSTOM')
    if (next === 'PERCENT') setMaxScore(100)
    if (next === 'MARK') setMaxScore(5)
    if (next === 'CUSTOM' && scale !== 'CUSTOM') setMaxScore(10)
  }

  const valid = name.trim() !== '' && maxScore >= 1 && pointsWorth >= 0

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!valid) return
    onSubmit(name.trim(), maxScore, pointsWorth, cadence)
    setName('')
    setCadence('DAILY')
    setMaxScore(100)
    setPointsWorth(0)
    setCustom(false)
  }

  return (
    <form
      onSubmit={handleSubmit}
      className="space-y-4 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700"
    >
      <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Yangi baholash toifasi</p>

      <div>
        <FormLabel>Nomi</FormLabel>
        <Input value={name} onChange={(e) => setName(e.target.value)} placeholder="Masalan: Gapirish" />
      </div>

      <div>
        <FormLabel>Qachon baholanadi?</FormLabel>
        <Tabs
          variant="segmented"
          size="md"
          active={cadence}
          onChange={setCadence}
          tabs={CADENCE_OPTIONS.map((c) => ({ key: c, label: assessmentCategoryCadenceLabel[c] }))}
        />
        <p className="mt-1.5 text-xs text-slate-400 dark:text-slate-500">{cadenceHint[cadence]}</p>
      </div>

      <div>
        <FormLabel>Qanday baholanadi?</FormLabel>
        <div role="radiogroup" className="grid grid-cols-3 gap-2">
          {SCALES.map((s) => {
            const active = scale === s.key
            return (
              <button
                key={s.key}
                type="button"
                role="radio"
                aria-checked={active}
                onClick={() => chooseScale(s.key)}
                className={`rounded-lg px-2 py-2 text-center transition-colors ${
                  active
                    ? 'bg-brand-50 ring-2 ring-inset ring-brand-500 dark:bg-brand-500/10 dark:ring-brand-400'
                    : 'ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:ring-slate-700 dark:hover:bg-slate-800'
                }`}
              >
                <p
                  className={`text-sm font-semibold ${
                    active ? 'text-brand-700 dark:text-brand-300' : 'text-slate-700 dark:text-slate-200'
                  }`}
                >
                  {s.title}
                </p>
                <p className="text-[11px] text-slate-400 dark:text-slate-500">{s.range}</p>
              </button>
            )
          })}
        </div>
      </div>

      <div className="space-y-2 rounded-xl bg-slate-50 p-3 dark:bg-slate-800/50">
        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <div>
            <FormLabel>Maksimal baho</FormLabel>
            <Input
              type="number"
              min={1}
              value={maxScore}
              disabled={scale !== 'CUSTOM'}
              onChange={(e) => setMaxScore(Number(e.target.value))}
              className="disabled:bg-slate-100 disabled:text-slate-500 dark:disabled:bg-slate-800"
            />
          </div>
          <div>
            <FormLabel>Reyting point</FormLabel>
            <Input type="number" min={0} value={pointsWorth} onChange={(e) => setPointsWorth(Number(e.target.value))} />
          </div>
        </div>
        {pointsWorth > 0 && maxScore >= 1 ? (
          <>
            <p className="text-xs text-slate-500 dark:text-slate-400">
              Oʻquvchi {scale === 'MARK' ? 'bahosi' : 'natijasi'} →{' '}
              <strong className="text-brand-700 dark:text-brand-300">Reytingga point</strong>
            </p>
            <PointsPreview maxScore={maxScore} pointsWorth={pointsWorth} />
            <p className="text-[11px] text-slate-400 dark:text-slate-500">Point 0.5 gacha yaxlitlanadi</p>
          </>
        ) : (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            0 point — bu toifa Reytingga taʼsir qilmaydi, faqat baho qoʻyiladi.
          </p>
        )}
      </div>

      <Button type="submit" loading={pending} disabled={!valid} className="w-full gap-1.5">
        <Plus className="h-4 w-4" />
        Toifa qoʻshish
      </Button>
    </form>
  )
}
