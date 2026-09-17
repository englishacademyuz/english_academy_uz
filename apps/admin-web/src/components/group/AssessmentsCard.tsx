import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { assessmentCategories as categoriesApi, assessments as assessmentsApi, ApiError } from '../../lib/api'
import { assessmentTypeLabel, formatDate, todayInputValue } from '../../lib/format'
import type { AssessmentType, Group } from '../../lib/types'
import {
  Badge,
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  Select,
  Spinner,
} from '../ui'

const TYPES: AssessmentType[] = ['WEEKLY', 'MONTHLY', 'GENERAL', 'CUSTOM']

export function AssessmentsCard({ group }: { group: Group }) {
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  const assessmentsQuery = useQuery({
    queryKey: ['group-assessments', group.id],
    queryFn: () => assessmentsApi.listForGroup(group.id),
  })
  const categoriesQuery = useQuery({
    queryKey: ['assessment-categories', group.levelId],
    queryFn: () => categoriesApi.list(group.levelId),
  })

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900">Baholashlar</h2>
        <Button variant="secondary" onClick={() => setShowCreate(true)} disabled={!categoriesQuery.data?.length}>
          <Plus className="h-4 w-4" /> Yangi
        </Button>
      </div>

      {!categoriesQuery.isLoading && categoriesQuery.data?.length === 0 && (
        <p className="mb-4 text-sm text-slate-400">
          Ushbu daraja uchun hali baholash toifalari sozlanmagan — Oʻquv dasturi boʻlimida qoʻshing.
        </p>
      )}

      {assessmentsQuery.isLoading ? (
        <Spinner />
      ) : assessmentsQuery.data?.length === 0 ? (
        <EmptyState title="Hali baholashlar kiritilmagan" />
      ) : (
        <ul className="divide-y divide-slate-100">
          {assessmentsQuery.data?.map((assessment) => {
            const average =
              assessment.results.length > 0
                ? assessment.results.reduce((sum, r) => sum + (r.score / assessment.maxScore) * 100, 0) /
                  assessment.results.length
                : null
            return (
              <li key={assessment.id} className="flex items-center justify-between py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{assessment.title}</p>
                  <p className="text-xs text-slate-500">
                    {assessment.category?.name} · {formatDate(assessment.date)} · {assessment.maxScore} balldan
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="slate">{assessment.results.length} ta baholandi</Badge>
                  {average !== null && <Badge tone="brand">oʻrtacha {average.toFixed(0)}%</Badge>}
                </div>
              </li>
            )
          })}
        </ul>
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
  const [scores, setScores] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)

  const roster = group.enrollments ?? []

  const createMutation = useMutation({
    mutationFn: () =>
      assessmentsApi.create(group.id, {
        categoryId,
        title,
        type,
        date,
        maxScore,
        results: Object.entries(scores)
          .filter(([, value]) => value !== '')
          .map(([studentId, value]) => ({ studentId, score: Number(value) })),
      }),
    onSuccess: onCreated,
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Baholashni yaratib boʻlmadi'),
  })

  return (
    <Modal title="Yangi baholash" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          createMutation.mutate()
        }}
        className="space-y-4"
      >
        {error && <ErrorBanner message={error} />}

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
            <Input
              type="number"
              min={1}
              value={maxScore}
              onChange={(e) => setMaxScore(Number(e.target.value))}
              required
            />
          </Field>
        </div>

        <Field label="Sana">
          <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} required />
        </Field>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">Ballar (hozircha ixtiyoriy)</span>
          <div className="max-h-48 space-y-2 overflow-y-auto pr-1">
            {roster.map((enrollment) => (
              <div key={enrollment.id} className="flex items-center gap-2">
                <span className="flex-1 truncate text-sm text-slate-700">
                  {enrollment.student?.firstName} {enrollment.student?.lastName}
                </span>
                <Input
                  type="number"
                  min={0}
                  max={maxScore}
                  className="w-20"
                  value={scores[enrollment.studentId] ?? ''}
                  onChange={(e) =>
                    setScores((prev) => ({ ...prev, [enrollment.studentId]: e.target.value }))
                  }
                />
              </div>
            ))}
          </div>
        </div>

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
