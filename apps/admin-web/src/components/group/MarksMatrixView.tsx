import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { assessmentCategories as categoriesApi, assessments as assessmentsApi } from '../../lib/api'
import { assessmentTypeLabel, formatDayMonth, toDateInputValue, todayInputValue } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Assessment, AssessmentType, Group } from '../../lib/types'
import { Button, Card, EmptyState, Field, Input, Modal, Select, Spinner } from '../ui'
import { StudentsMatrixTable, type MatrixColumn } from './StudentsMatrixTable'

const TYPES: AssessmentType[] = ['WEEKLY', 'MONTHLY', 'GENERAL', 'CUSTOM']

/**
 * Columns follow the Level's assessment-category configuration (§18/§43):
 * a single-category level gets one column per date, a multi-category level
 * gets one sub-column per category that was actually graded that date.
 * Cells are graded by editing them directly, no separate results screen.
 */
export function MarksMatrixView({ group }: { group: Group }) {
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()
  const roster = group.enrollments ?? []

  const assessmentsQuery = useQuery({
    queryKey: ['group-assessments', group.id],
    queryFn: () => assessmentsApi.listForGroup(group.id),
  })
  const categoriesQuery = useQuery({
    queryKey: ['assessment-categories', group.levelId],
    queryFn: () => categoriesApi.list(group.levelId),
  })

  const scoreMutation = useMutation({
    mutationFn: ({ assessmentId, studentId, score }: { assessmentId: string; studentId: string; score: number }) =>
      assessmentsApi.recordResults(assessmentId, [{ studentId, score }]),
    onSuccess: () => {
      notifySuccess('Baho saqlandi')
      queryClient.invalidateQueries({ queryKey: ['group-assessments', group.id] })
    },
    onError: (err) => notifyError(err, 'Bahoni saqlab boʻlmadi'),
  })

  const assessments = assessmentsQuery.data ?? []
  const byDate = new Map<string, Assessment[]>()
  for (const a of assessments) {
    const key = toDateInputValue(a.date)
    const list = byDate.get(key) ?? []
    list.push(a)
    byDate.set(key, list)
  }
  const dateKeys = [...byDate.keys()].sort()

  const columns: MatrixColumn[] = []
  for (const dateKey of dateKeys) {
    const dayAssessments = [...(byDate.get(dateKey) ?? [])].sort((a, b) =>
      (a.category?.name ?? '').localeCompare(b.category?.name ?? ''),
    )
    for (const assessment of dayAssessments) {
      columns.push({
        key: assessment.id,
        header: (
          <div>
            <p>{formatDayMonth(assessment.date)}</p>
            {dayAssessments.length > 1 && (
              <p className="mt-0.5 text-[10px] font-normal text-slate-400 dark:text-slate-500">
                {assessment.category?.name}
              </p>
            )}
          </div>
        ),
        render: (studentId) => (
          <ScoreCell
            assessment={assessment}
            score={assessment.results.find((r) => r.studentId === studentId)?.score ?? null}
            onSave={(score) => scoreMutation.mutate({ assessmentId: assessment.id, studentId, score })}
          />
        ),
      })
    }
  }

  if (dateKeys.length > 0) {
    columns.push({
      key: 'average',
      header: "Oʻrtacha %",
      render: (studentId) => {
        const scores = assessments
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

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Baholar</h2>
        <Button variant="secondary" onClick={() => setShowCreate(true)} disabled={!categoriesQuery.data?.length}>
          <Plus className="h-4 w-4" /> Yangi baholash
        </Button>
      </div>

      {!categoriesQuery.isLoading && categoriesQuery.data?.length === 0 && (
        <p className="mb-4 text-sm text-slate-400 dark:text-slate-500">
          Ushbu daraja uchun hali baholash toifalari sozlanmagan — Oʻquv dasturi boʻlimida qoʻshing.
        </p>
      )}

      {assessmentsQuery.isLoading ? (
        <Spinner />
      ) : dateKeys.length === 0 ? (
        <EmptyState title="Hali baholash kiritilmagan" />
      ) : (
        <StudentsMatrixTable roster={roster} columns={columns} />
      )}

      {showCreate && (
        <CreateAssessmentModal
          group={group}
          categories={categoriesQuery.data ?? []}
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['group-assessments', group.id] })
            setShowCreate(false)
          }}
        />
      )}
    </Card>
  )
}

function ScoreCell({
  assessment,
  score,
  onSave,
}: {
  assessment: Assessment
  score: number | null
  onSave: (score: number) => void
}) {
  const [value, setValue] = useState(score !== null ? String(score) : '')

  return (
    <input
      type="number"
      min={0}
      max={assessment.maxScore}
      value={value}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        const num = Number(value)
        if (value !== '' && !Number.isNaN(num) && num !== score) onSave(num)
      }}
      placeholder="—"
      className="w-14 rounded-md border border-slate-200 bg-transparent px-1.5 py-1 text-center text-xs text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-200 dark:border-slate-700 dark:text-slate-100"
    />
  )
}

function CreateAssessmentModal({
  group,
  categories,
  onClose,
  onCreated,
}: {
  group: Group
  categories: { id: string; name: string }[]
  onClose: () => void
  onCreated: () => void
}) {
  const [categoryId, setCategoryId] = useState(categories[0]?.id ?? '')
  const [title, setTitle] = useState('')
  const [type, setType] = useState<AssessmentType>('WEEKLY')
  const [date, setDate] = useState(todayInputValue())
  const [maxScore, setMaxScore] = useState(100)

  const createMutation = useMutation({
    mutationFn: () => assessmentsApi.create(group.id, { categoryId, title, type, date, maxScore }),
    onSuccess: () => {
      notifySuccess('Baholash yaratildi')
      onCreated()
    },
    onError: (err) => notifyError(err, 'Baholashni yaratib boʻlmadi'),
  })

  return (
    <Modal title="Yangi baholash" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          createMutation.mutate()
        }}
        className="space-y-4"
      >
        <Field label="Toifa">
          <Select value={categoryId} onChange={(e) => setCategoryId(e.target.value)} required>
            {categories.map((c) => (
              <option key={c.id} value={c.id}>
                {c.name}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Sarlavha">
          <Input value={title} onChange={(e) => setTitle(e.target.value)} required placeholder="3-hafta nazorati" />
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

        <Field label="Sana">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>

        <p className="text-xs text-slate-400 dark:text-slate-500">
          Ballarni jadval katakchalarini toʻgʻridan-toʻgʻri tahrirlab kiritasiz.
        </p>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Baholash yaratish
          </Button>
        </div>
      </form>
    </Modal>
  )
}
