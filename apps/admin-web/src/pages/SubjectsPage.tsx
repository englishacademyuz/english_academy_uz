import { useEffect, useState, type FormEvent } from 'react'
import { useMutation, useQueries, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronRight, Plus, Trash2 } from 'lucide-react'
import {
  assessmentCategories as categoriesApi,
  courses as coursesApi,
  levels as levelsApi,
  subjects as subjectsApi,
} from '../lib/api'
import { notifyError, notifySuccess } from '../lib/toast'
import { Badge, Button, Card, Input, PageHeader, Select, Spinner } from '../components/ui'
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
}: {
  title: string
  items: Array<{ id: string; name: string }>
  selectedId: string | null
  onSelect: (id: string) => void
  getCount?: (id: string) => number | undefined
  addPlaceholder: string
  onAdd: (name: string) => void
  addPending: boolean
  emptyLabel: string
}) {
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
              return (
                <li key={item.id}>
                  <button
                    onClick={() => onSelect(item.id)}
                    className={`flex w-full items-center justify-between gap-2 rounded-lg border-l-2 px-2.5 py-2 text-left text-sm transition-colors ${
                      active
                        ? 'border-brand-600 bg-brand-50 font-semibold text-brand-700 dark:border-brand-400 dark:bg-brand-500/10 dark:text-brand-300'
                        : 'border-transparent text-slate-600 hover:bg-slate-50 dark:text-slate-300 dark:hover:bg-slate-800/60'
                    }`}
                  >
                    <span className="truncate">{item.name}</span>
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

function CategoryCard({ category, onRetire }: { category: AssessmentCategory; onRetire: () => void }) {
  const scaleLabel = category.maxScore === 100 ? 'Foiz' : category.maxScore === 5 ? 'Baho' : `0–${category.maxScore}`

  return (
    <div className="rounded-xl border border-slate-200 p-4 dark:border-slate-700">
      <div className="flex items-center justify-between gap-3">
        <p className="font-semibold text-slate-900 dark:text-slate-100">{category.name}</p>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={category.cadence === 'DAILY' ? 'slate' : 'amber'}>
            {assessmentCategoryCadenceLabel[category.cadence]}
          </Badge>
          <Badge tone="brand">{scaleLabel}</Badge>
          <button
            onClick={onRetire}
            title="Chetlash uchun bosing"
            className="rounded-lg p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-500 dark:text-slate-500 dark:hover:bg-red-500/10 dark:hover:text-red-400"
          >
            <Trash2 className="h-4 w-4" />
          </button>
        </div>
      </div>
      <div className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
        <span>
          Maksimal: <strong className="font-semibold text-slate-700 dark:text-slate-200">{category.maxScore}</strong>
        </span>
        {category.pointsWorth > 0 && (
          <span>
            Reyting ball:{' '}
            <strong className="font-semibold text-slate-700 dark:text-slate-200">{category.pointsWorth}</strong>
          </span>
        )}
      </div>
    </div>
  )
}

const MAX_SCORE_PRESETS = [
  { label: 'Foiz (0-100)', value: 100 },
  { label: 'Baho (0-5)', value: 5 },
]

/** Captures the category's grading scale (§18/§43/§51.1) and its Rating weight -- both fixed
 once here so a teacher never has to re-type them while grading, and a 100% result auto-awards
 pointsWorth points to the Reyting ledger (0 = doesn't feed Reyting). */
const CADENCE_OPTIONS: AssessmentCategoryCadence[] = ['DAILY', 'WEEKLY', 'MONTHLY']

function CategoryAddForm({
  onSubmit,
  pending,
}: {
  onSubmit: (name: string, maxScore: number, pointsWorth: number, cadence: AssessmentCategoryCadence) => void
  pending: boolean
}) {
  const [name, setName] = useState('')
  const [maxScore, setMaxScore] = useState(100)
  const [pointsWorth, setPointsWorth] = useState(0)
  const [cadence, setCadence] = useState<AssessmentCategoryCadence>('DAILY')

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (!name.trim() || maxScore < 1 || pointsWorth < 0) return
    onSubmit(name.trim(), maxScore, pointsWorth, cadence)
    setName('')
    setMaxScore(100)
    setPointsWorth(0)
    setCadence('DAILY')
  }

  return (
    <form onSubmit={handleSubmit} className="space-y-2 rounded-xl border border-dashed border-slate-300 p-4 dark:border-slate-700">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Yangi baholash toifasi</p>
      <div className="flex flex-wrap gap-2">
        <Input
          value={name}
          onChange={(e) => setName(e.target.value)}
          placeholder="Masalan: Gapirish"
          className="min-w-40 flex-1 text-sm"
        />
        <Select
          value={cadence}
          onChange={(e) => setCadence(e.target.value as AssessmentCategoryCadence)}
          className="w-32 text-sm"
          title="Necha marta baholanadi"
        >
          {CADENCE_OPTIONS.map((c) => (
            <option key={c} value={c}>
              {assessmentCategoryCadenceLabel[c]}
            </option>
          ))}
        </Select>
        <Input
          type="number"
          min={1}
          value={maxScore}
          onChange={(e) => setMaxScore(Number(e.target.value))}
          className="w-20 text-sm"
          title="Maksimal ball"
        />
        <Input
          type="number"
          min={0}
          value={pointsWorth}
          onChange={(e) => setPointsWorth(Number(e.target.value))}
          className="w-24 text-sm"
          title="100% natija Reytingga necha ball beradi (0 — Reytingga ta'sir qilmaydi)"
          placeholder="Reyting"
        />
        <Button type="submit" variant="secondary" loading={pending}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      <div className="flex gap-1.5">
        {MAX_SCORE_PRESETS.map((preset) => (
          <button
            key={preset.value}
            type="button"
            onClick={() => setMaxScore(preset.value)}
            className={`rounded-md px-2 py-0.5 text-[11px] font-medium transition-colors ${
              maxScore === preset.value
                ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/15 dark:text-brand-300'
                : 'text-slate-400 hover:bg-slate-200 dark:text-slate-500 dark:hover:bg-slate-700'
            }`}
          >
            {preset.label}
          </button>
        ))}
      </div>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Kunlik toifalar har bir dars kunida ustun sifatida ochiq turadi. Haftalik/oylik toifalar esa faqat
        oʻqituvchi "Belgilash qoʻshish" orqali oʻsha davrni ochganda baholanadi.
      </p>
      <p className="text-[11px] text-slate-400 dark:text-slate-500">
        Reyting ball — 100% natija (yoki maksimal baho) uchun beriladigan ball. Oraliq natijalar shunga mutanosib
        hisoblanadi (masalan, 50% → yarim ball).
      </p>
    </form>
  )
}
