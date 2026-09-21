import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { assessmentCategories as categoriesApi, assessments as assessmentsApi } from '../../lib/api'
import { assessmentTypeLabel, toDateInputValue, todayInputValue } from '../../lib/format'
import { isSameDay } from '../../lib/dateRange'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Assessment, AssessmentCategory, AssessmentType, Group } from '../../lib/types'
import { Button, ColumnLabel, Field, Input, Modal, Select, Spinner } from '../ui'
import { DetailMatrix, type MatrixColumn } from './DetailMatrix'
import { DayNavHeader } from './DayNavHeader'
import { useLessonDayNav } from './useLessonDayNav'

const TYPES: AssessmentType[] = ['WEEKLY', 'MONTHLY', 'GENERAL', 'CUSTOM']

/** A category's routine, once-per-lesson entry always uses its own name as the title -- an
 * assessment whose title differs is an ad-hoc "add marking" entry (control work, etc). */
function isRoutineEntry(assessment: Assessment, category: AssessmentCategory | undefined): boolean {
  return !!category && assessment.title === category.name
}

/**
 * Grading tab: every configured category for the group's Level shows up as a column each
 * lesson day (§18/§43), today editable and past days locked to what was recorded -- the same
 * day-by-day pattern as JournalView (attendance), sharing its navigation via useLessonDayNav.
 * A teacher can additionally "add marking" for today -- a one-off titled entry (a control work,
 * say) that everyone gets graded on, appearing as an extra column alongside the routine ones.
 */
export function MarksMatrixView({ group }: { group: Group }) {
  const nav = useLessonDayNav(group.id)
  const { selectedDate, isSelectedToday, monthAnchor, monthEnd } = nav
  const [showAddMarking, setShowAddMarking] = useState(false)
  const queryClient = useQueryClient()
  const roster = group.enrollments ?? []

  const categoriesQuery = useQuery({
    queryKey: ['assessment-categories', group.levelId],
    queryFn: () => categoriesApi.list(group.levelId),
  })
  const categories = categoriesQuery.data ?? []

  const assessmentsQuery = useQuery({
    queryKey: ['group-assessments', group.id, monthAnchor.getFullYear(), monthAnchor.getMonth()],
    queryFn: () =>
      assessmentsApi.listForGroup(group.id, { from: toDateInputValue(monthAnchor), to: toDateInputValue(monthEnd) }),
  })
  const assessmentsForDay = (assessmentsQuery.data ?? []).filter((a) => isSameDay(new Date(a.date), selectedDate))

  function invalidate() {
    queryClient.invalidateQueries({ queryKey: ['group-assessments', group.id] })
  }

  const gradeMutation = useMutation({
    mutationFn: (input: { categoryId: string; title: string; type: AssessmentType; maxScore?: number; studentId: string; score: number }) =>
      assessmentsApi.create(group.id, {
        categoryId: input.categoryId,
        title: input.title,
        type: input.type,
        date: todayInputValue(),
        maxScore: input.maxScore,
        results: [{ studentId: input.studentId, score: input.score }],
      }),
    onSuccess: () => {
      notifySuccess('Baho saqlandi')
      invalidate()
    },
    onError: (err) => notifyError(err, 'Bahoni saqlab boʻlmadi'),
  })

  const extraEntries = assessmentsForDay.filter((a) => !isRoutineEntry(a, categories.find((c) => c.id === a.categoryId)))

  const routineColumns: MatrixColumn[] = categories.map((category) => {
    const assessment = assessmentsForDay.find((a) => isRoutineEntry(a, category) && a.categoryId === category.id)
    return {
      key: `cat-${category.id}`,
      width: 96,
      header: <ColumnLabel>{category.name}</ColumnLabel>,
      render: (studentId) => (
        <ScoreCell
          maxScore={assessment?.maxScore ?? category.maxScore}
          score={assessment?.results.find((r) => r.studentId === studentId)?.score ?? null}
          editable={isSelectedToday}
          onSave={(score) =>
            gradeMutation.mutate({ categoryId: category.id, title: category.name, type: 'GENERAL', studentId, score })
          }
        />
      ),
    }
  })

  const extraColumns: MatrixColumn[] = extraEntries.map((assessment) => ({
    key: `extra-${assessment.id}`,
    width: 110,
    // Single-line, like every other column header -- the colhead band's fixed
    // height is shared with JournalView's own two-row (nav + labels) header,
    // so a taller per-column header here would overflow it for every tab.
    header: <ColumnLabel>{assessment.title}</ColumnLabel>,
    render: (studentId) => (
      <ScoreCell
        maxScore={assessment.maxScore}
        score={assessment.results.find((r) => r.studentId === studentId)?.score ?? null}
        editable={isSelectedToday}
        onSave={(score) =>
          gradeMutation.mutate({
            categoryId: assessment.categoryId,
            title: assessment.title,
            type: assessment.type,
            maxScore: assessment.maxScore,
            studentId,
            score,
          })
        }
      />
    ),
  }))

  const columns: MatrixColumn[] = [...routineColumns, ...extraColumns]
  if (columns.length > 0) {
    columns.push({
      key: 'average',
      width: 92,
      header: <ColumnLabel>Oʻrtacha %</ColumnLabel>,
      render: (studentId) => {
        const scores = assessmentsForDay
          .map((a) => {
            const result = a.results.find((r) => r.studentId === studentId)
            return result ? (result.score / a.maxScore) * 100 : null
          })
          .filter((v): v is number => v !== null)
        if (scores.length === 0) return <span className="text-slate-300 dark:text-slate-600">—</span>
        const avg = scores.reduce((sum, v) => sum + v, 0) / scores.length
        return <span className="text-xs font-semibold text-slate-600 dark:text-slate-400">{avg.toFixed(0)}%</span>
      },
    })
  }

  const isLoading = categoriesQuery.isLoading || assessmentsQuery.isLoading

  return (
    <div className="flex flex-1 flex-col">
      {!categoriesQuery.isLoading && categories.length === 0 && (
        <p className="px-5 pt-3 text-sm text-slate-400 dark:text-slate-500">
          Ushbu daraja uchun hali baholash toifalari sozlanmagan — Oʻquv dasturi boʻlimida qoʻshing.
        </p>
      )}

      {isLoading ? (
        <Spinner />
      ) : (
        <DetailMatrix
          roster={roster}
          columns={columns}
          groupHeader={
            <DayNavHeader
              selectedDate={nav.selectedDate}
              isSelectedToday={nav.isSelectedToday}
              canGoNext={nav.canGoNext}
              isFetching={nav.isFetching}
              onPrev={nav.goPrev}
              onNext={nav.goNext}
              onToday={nav.goToday}
            />
          }
        />
      )}

      {isSelectedToday && (
        <div className="flex justify-end px-5 py-2.5">
          <Button size="sm" variant="secondary" onClick={() => setShowAddMarking(true)} disabled={categories.length === 0}>
            <Plus className="h-3.5 w-3.5" /> Belgilash qoʻshish
          </Button>
        </div>
      )}

      {showAddMarking && (
        <AddMarkingModal
          group={group}
          categories={categories}
          onClose={() => setShowAddMarking(false)}
          onCreated={() => {
            invalidate()
            setShowAddMarking(false)
          }}
        />
      )}
    </div>
  )
}

function ScoreCell({
  maxScore,
  score,
  editable,
  onSave,
}: {
  maxScore: number
  score: number | null
  editable: boolean
  onSave: (score: number) => void
}) {
  const [value, setValue] = useState(score !== null ? String(score) : '')

  if (!editable) {
    if (score === null) return <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
    return (
      <span className="inline-flex items-center justify-center rounded-lg bg-slate-100 px-2.5 py-1 text-xs font-semibold text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
        {score}
        <span className="ml-0.5 font-normal text-slate-400 dark:text-slate-500">/{maxScore}</span>
      </span>
    )
  }

  return (
    <input
      type="number"
      min={0}
      max={maxScore}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const num = Number(value)
        if (value !== '' && !Number.isNaN(num) && num !== score) onSave(num)
      }}
      placeholder="—"
      className="w-16 rounded-lg border border-slate-200 bg-transparent px-1.5 py-1.5 text-center text-sm font-medium text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:text-slate-100 dark:focus:ring-brand-500/20"
    />
  )
}

function AddMarkingModal({
  group,
  categories,
  onClose,
  onCreated,
}: {
  group: Group
  categories: AssessmentCategory[]
  onClose: () => void
  onCreated: () => void
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<AssessmentType>('CUSTOM')
  const selectedCategory = categories.find((c) => c.id === categoryId)
  const [maxScore, setMaxScore] = useState(selectedCategory?.maxScore ?? 100)

  function handleCategoryChange(id: string) {
    setCategoryId(id)
    const category = categories.find((c) => c.id === id)
    if (category) setMaxScore(category.maxScore)
  }

  const createMutation = useMutation({
    mutationFn: () =>
      assessmentsApi.create(group.id, { categoryId, title, type, date: todayInputValue(), maxScore }),
    onSuccess: () => {
      notifySuccess('Belgilash qoʻshildi')
      onCreated()
    },
    onError: (err) => notifyError(err, 'Belgilashni qoʻshib boʻlmadi'),
  })

  return (
    <Modal title="Bugungi belgilash qoʻshish" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          createMutation.mutate()
        }}
        className="space-y-4"
      >
        <Field label="Toifa">
          <Select value={categoryId} onChange={(e) => handleCategoryChange(e.target.value)} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Nomi">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="3-nazorat ishi" />
        </Field>

        <div className="grid grid-cols-2 gap-4">
          <Field label="Turi">
            <Select value={type} onChange={(e) => setType(e.target.value as AssessmentType)}>
              {TYPES.map((t) => (
                <option key={t} value={t}>
                  {assessmentTypeLabel[t]}
                </option>
              ))}
            </Select>
          </Field>
          <Field label="Maksimal ball">
            <Input type="number" min={1} value={maxScore} onChange={(e) => setMaxScore(Number(e.target.value))} required />
          </Field>
        </div>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Bugungi sana bilan qoʻshiladi. Natijalarni jadval katakchalarini toʻgʻridan-toʻgʻri tahrirlab kiritasiz.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={createMutation.isPending} disabled={!categoryId}>
            Qoʻshish
          </Button>
        </div>
      </form>
    </Modal>
  )
}
