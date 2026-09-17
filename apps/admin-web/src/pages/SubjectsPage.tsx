import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import {
  ApiError,
  assessmentCategories as categoriesApi,
  courses as coursesApi,
  levels as levelsApi,
  subjects as subjectsApi,
} from '../lib/api'
import { Badge, Button, Card, ErrorBanner, Input, PageHeader, Spinner } from '../components/ui'

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

export function SubjectsPage() {
  const [error, setError] = useState<string | null>(null)
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const subjectsQuery = useQuery({ queryKey: ['subjects'], queryFn: subjectsApi.list })

  const createSubject = useMutation({
    mutationFn: (name: string) => subjectsApi.create(name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['subjects'] }),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Fanni yaratib boʻlmadi'),
  })

  function toggle(id: string) {
    setExpandedSubjects((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div>
      <PageHeader title="Oʻquv dasturi" description="Fanlar, kurslar, darajalar va baholash toifalari" />

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <Card className="p-5">
        <div className="mb-4">
          <InlineAddForm
            placeholder="Yangi fan nomi"
            onSubmit={(name) => createSubject.mutate(name)}
            pending={createSubject.isPending}
          />
        </div>

        {subjectsQuery.isLoading ? (
          <Spinner />
        ) : (
          <ul className="space-y-2">
            {subjectsQuery.data?.map((subject) => (
              <li key={subject.id} className="rounded-lg border border-slate-200">
                <button
                  onClick={() => toggle(subject.id)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-slate-900"
                >
                  {expandedSubjects.has(subject.id) ? (
                    <ChevronDown className="h-4 w-4 text-slate-400" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400" />
                  )}
                  {subject.name}
                </button>
                {expandedSubjects.has(subject.id) && (
                  <div className="border-t border-slate-100 px-4 py-3">
                    <CoursesSection subjectId={subject.id} onError={setError} />
                  </div>
                )}
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function CoursesSection({ subjectId, onError }: { subjectId: string; onError: (msg: string) => void }) {
  const queryClient = useQueryClient()
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set())
  const coursesQuery = useQuery({ queryKey: ['courses', subjectId], queryFn: () => coursesApi.list(subjectId) })

  const createCourse = useMutation({
    mutationFn: (name: string) => coursesApi.create(subjectId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['courses', subjectId] }),
    onError: (err) => onError(err instanceof ApiError ? err.message : 'Kursni yaratib boʻlmadi'),
  })

  function toggle(id: string) {
    setExpandedCourses((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-3 pl-2">
      <InlineAddForm placeholder="Yangi kurs nomi" onSubmit={(name) => createCourse.mutate(name)} pending={createCourse.isPending} />
      <ul className="space-y-2">
        {coursesQuery.data?.map((course) => (
          <li key={course.id} className="rounded-lg bg-slate-50">
            <button
              onClick={() => toggle(course.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700"
            >
              {expandedCourses.has(course.id) ? (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400" />
              )}
              {course.name}
            </button>
            {expandedCourses.has(course.id) && (
              <div className="px-3 pb-3">
                <LevelsSection courseId={course.id} onError={onError} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function LevelsSection({ courseId, onError }: { courseId: string; onError: (msg: string) => void }) {
  const queryClient = useQueryClient()
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set())
  const levelsQuery = useQuery({ queryKey: ['levels', courseId], queryFn: () => levelsApi.list(courseId) })

  const createLevel = useMutation({
    mutationFn: (name: string) => levelsApi.create(courseId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['levels', courseId] }),
    onError: (err) => onError(err instanceof ApiError ? err.message : 'Darajani yaratib boʻlmadi'),
  })

  function toggle(id: string) {
    setExpandedLevels((prev) => {
      const next = new Set(prev)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  return (
    <div className="space-y-2 pl-2">
      <InlineAddForm placeholder="Yangi daraja nomi" onSubmit={(name) => createLevel.mutate(name)} pending={createLevel.isPending} />
      <ul className="space-y-2">
        {levelsQuery.data?.map((level) => (
          <li key={level.id} className="rounded-lg bg-white ring-1 ring-inset ring-slate-200">
            <button
              onClick={() => toggle(level.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600"
            >
              {expandedLevels.has(level.id) ? (
                <ChevronDown className="h-3 w-3 text-slate-400" />
              ) : (
                <ChevronRight className="h-3 w-3 text-slate-400" />
              )}
              {level.name}
            </button>
            {expandedLevels.has(level.id) && (
              <div className="px-3 pb-3">
                <AssessmentCategoriesSection levelId={level.id} onError={onError} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AssessmentCategoriesSection({ levelId, onError }: { levelId: string; onError: (msg: string) => void }) {
  const queryClient = useQueryClient()
  const categoriesQuery = useQuery({
    queryKey: ['assessment-categories', levelId],
    queryFn: () => categoriesApi.list(levelId),
  })

  const createCategory = useMutation({
    mutationFn: (name: string) => categoriesApi.create(levelId, name),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assessment-categories', levelId] }),
    onError: (err) => onError(err instanceof ApiError ? err.message : 'Toifani yaratib boʻlmadi'),
  })

  const retireCategory = useMutation({
    mutationFn: (id: string) => categoriesApi.retire(id),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['assessment-categories', levelId] }),
    onError: (err) => onError(err instanceof ApiError ? err.message : 'Toifani chetlab boʻlmadi'),
  })

  return (
    <div className="space-y-2 rounded-lg bg-slate-50 p-3">
      <p className="text-xs font-medium text-slate-500">Baholash toifalari</p>
      <InlineAddForm
        placeholder="Masalan: Gapirish"
        onSubmit={(name) => createCategory.mutate(name)}
        pending={createCategory.isPending}
      />
      <div className="flex flex-wrap gap-1.5">
        {categoriesQuery.data?.map((category) => (
          <button
            key={category.id}
            onClick={() => retireCategory.mutate(category.id)}
            title="Chetlash uchun bosing"
            className="group"
          >
            <Badge tone="brand">
              {category.name}
              <span className="ml-1 text-brand-400 group-hover:text-red-500">×</span>
            </Badge>
          </button>
        ))}
      </div>
    </div>
  )
}
