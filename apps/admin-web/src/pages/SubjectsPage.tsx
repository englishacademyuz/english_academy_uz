import { useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { ChevronDown, ChevronRight, Plus } from 'lucide-react'
import {
  assessmentCategories as categoriesApi,
  courses as coursesApi,
  levels as levelsApi,
  subjects as subjectsApi,
} from '../lib/api'
import { notifyError, notifySuccess } from '../lib/toast'
import { Badge, Button, Card, Input, PageHeader, Spinner } from '../components/ui'

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
  const [expandedSubjects, setExpandedSubjects] = useState<Set<string>>(new Set())
  const queryClient = useQueryClient()

  const subjectsQuery = useQuery({ queryKey: ['subjects'], queryFn: subjectsApi.list })

  const createSubject = useMutation({
    mutationFn: (name: string) => subjectsApi.create(name),
    onSuccess: () => {
      notifySuccess('Fan yaratildi')
      queryClient.invalidateQueries({ queryKey: ['subjects'] })
    },
    onError: (err) => notifyError(err, 'Fanni yaratib boʻlmadi'),
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
              <li key={subject.id} className="rounded-lg border border-slate-200 dark:border-slate-700">
                <button
                  onClick={() => toggle(subject.id)}
                  className="flex w-full items-center gap-2 px-4 py-3 text-left text-sm font-medium text-slate-900 dark:text-slate-100"
                >
                  {expandedSubjects.has(subject.id) ? (
                    <ChevronDown className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 text-slate-400 dark:text-slate-500" />
                  )}
                  {subject.name}
                </button>
                {expandedSubjects.has(subject.id) && (
                  <div className="border-t border-slate-100 dark:border-slate-800 px-4 py-3">
                    <CoursesSection subjectId={subject.id} />
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

function CoursesSection({ subjectId }: { subjectId: string }) {
  const queryClient = useQueryClient()
  const [expandedCourses, setExpandedCourses] = useState<Set<string>>(new Set())
  const coursesQuery = useQuery({ queryKey: ['courses', subjectId], queryFn: () => coursesApi.list(subjectId) })

  const createCourse = useMutation({
    mutationFn: (name: string) => coursesApi.create(subjectId, name),
    onSuccess: () => {
      notifySuccess('Kurs yaratildi')
      queryClient.invalidateQueries({ queryKey: ['courses', subjectId] })
    },
    onError: (err) => notifyError(err, 'Kursni yaratib boʻlmadi'),
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
          <li key={course.id} className="rounded-lg bg-slate-50 dark:bg-slate-800/60">
            <button
              onClick={() => toggle(course.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-sm font-medium text-slate-700 dark:text-slate-300"
            >
              {expandedCourses.has(course.id) ? (
                <ChevronDown className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              ) : (
                <ChevronRight className="h-3.5 w-3.5 text-slate-400 dark:text-slate-500" />
              )}
              {course.name}
            </button>
            {expandedCourses.has(course.id) && (
              <div className="px-3 pb-3">
                <LevelsSection courseId={course.id} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function LevelsSection({ courseId }: { courseId: string }) {
  const queryClient = useQueryClient()
  const [expandedLevels, setExpandedLevels] = useState<Set<string>>(new Set())
  const levelsQuery = useQuery({ queryKey: ['levels', courseId], queryFn: () => levelsApi.list(courseId) })

  const createLevel = useMutation({
    mutationFn: (name: string) => levelsApi.create(courseId, name),
    onSuccess: () => {
      notifySuccess('Daraja yaratildi')
      queryClient.invalidateQueries({ queryKey: ['levels', courseId] })
    },
    onError: (err) => notifyError(err, 'Darajani yaratib boʻlmadi'),
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
          <li key={level.id} className="rounded-lg bg-white dark:bg-slate-900 ring-1 ring-inset ring-slate-200 dark:ring-slate-700">
            <button
              onClick={() => toggle(level.id)}
              className="flex w-full items-center gap-2 px-3 py-2 text-left text-xs font-medium text-slate-600 dark:text-slate-400"
            >
              {expandedLevels.has(level.id) ? (
                <ChevronDown className="h-3 w-3 text-slate-400 dark:text-slate-500" />
              ) : (
                <ChevronRight className="h-3 w-3 text-slate-400 dark:text-slate-500" />
              )}
              {level.name}
            </button>
            {expandedLevels.has(level.id) && (
              <div className="px-3 pb-3">
                <AssessmentCategoriesSection levelId={level.id} />
              </div>
            )}
          </li>
        ))}
      </ul>
    </div>
  )
}

function AssessmentCategoriesSection({ levelId }: { levelId: string }) {
  const queryClient = useQueryClient()
  const categoriesQuery = useQuery({
    queryKey: ['assessment-categories', levelId],
    queryFn: () => categoriesApi.list(levelId),
  })

  const createCategory = useMutation({
    mutationFn: (name: string) => categoriesApi.create(levelId, name),
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
    <div className="space-y-2 rounded-lg bg-slate-50 dark:bg-slate-800/60 p-3">
      <p className="text-xs font-medium text-slate-500 dark:text-slate-400">Baholash toifalari</p>
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
              <span className="ml-1 text-brand-400 dark:text-brand-300 group-hover:text-red-500 dark:group-hover:text-red-400">×</span>
            </Badge>
          </button>
        ))}
      </div>
    </div>
  )
}
