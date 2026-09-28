import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Plus, Trash2 } from 'lucide-react'
import { quizzes as quizzesApi } from '../../lib/api'
import { toDateInputValue } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { QuizDetail, QuizInput, QuizQuestionInput } from '../../lib/types'
import { Button, Card, Field, Input } from '../ui'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']
const MAX_OPTIONS = 6

const blankQuestion = (): QuizQuestionInput => ({
  text: '',
  options: [
    { text: '', isCorrect: true },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
    { text: '', isCorrect: false },
  ],
})

/** Blank options are just unused slots -- dropped rather than rejected. */
function withoutBlankOptions(questions: QuizQuestionInput[]): QuizQuestionInput[] {
  return questions.map((q) => ({ ...q, options: q.options.filter((o) => o.text.trim()) }))
}

/** Mirrors the server's rules so the teacher sees the problem before saving. */
function validationError(input: QuizInput): string | null {
  if (!input.title.trim()) return 'Test nomini kiriting'
  if (!Number.isInteger(input.maxPoints) || input.maxPoints < 0) return 'Maksimal ball 0 yoki undan katta butun son boʻlsin'
  for (const [i, q] of input.questions.entries()) {
    if (!q.text.trim()) return `${i + 1}-savol matni boʻsh`
    if (q.options.length < 2) return `${i + 1}-savolda kamida 2 ta variant boʻlsin`
    if (!q.options.some((o) => o.isCorrect)) return `${i + 1}-savolda toʻgʻri javob matni boʻsh`
  }
  return null
}

export function QuizEditor({
  groupId,
  initialDate,
  quiz,
  onDone,
}: {
  groupId: string
  initialDate: Date
  /** Present when editing an existing draft. */
  quiz?: QuizDetail
  onDone: () => void
}) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(toDateInputValue(quiz ? new Date(quiz.date) : initialDate))
  const [title, setTitle] = useState(quiz?.title ?? '')
  const [maxPoints, setMaxPoints] = useState(String(quiz?.maxPoints ?? 10))
  const [questions, setQuestions] = useState<QuizQuestionInput[]>(
    quiz
      ? quiz.questions.map((q) => ({ text: q.text, options: q.options.map((o) => ({ text: o.text, isCorrect: o.isCorrect })) }))
      : [blankQuestion()],
  )
  const [error, setError] = useState<string | null>(null)

  const input: QuizInput = { title, maxPoints: Number(maxPoints), questions: withoutBlankOptions(questions) }

  const saveMutation = useMutation({
    mutationFn: () => (quiz ? quizzesApi.update(quiz.id, input) : quizzesApi.create(groupId, date, input)),
    onSuccess: () => {
      notifySuccess('Test saqlandi')
      queryClient.invalidateQueries({ queryKey: ['group-quizzes', groupId] })
      if (quiz) queryClient.invalidateQueries({ queryKey: ['quiz', quiz.id] })
      onDone()
    },
    onError: (err) => notifyError(err, 'Testni saqlab boʻlmadi'),
  })

  function updateQuestion(index: number, change: (q: QuizQuestionInput) => QuizQuestionInput) {
    setQuestions((prev) => prev.map((q, i) => (i === index ? change(q) : q)))
    setError(null)
  }

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">
        {quiz ? 'Testni tahrirlash' : 'Yangi test'}
      </h2>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          const problem = validationError(input)
          setError(problem)
          if (!problem) saveMutation.mutate()
        }}
        className="space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-[1fr_10rem_10rem]">
          <Field label="Test nomi">
            <Input value={title} onChange={(e) => setTitle(e.target.value)} placeholder="Kunlik lugʻat testi" />
          </Field>
          <Field label="Dars sanasi">
            <Input type="date" value={date} onChange={(e) => setDate(e.target.value)} disabled={!!quiz} />
          </Field>
          <Field label="Maksimal ball">
            <Input type="number" min={0} step={1} value={maxPoints} onChange={(e) => setMaxPoints(e.target.value)} />
          </Field>
        </div>
        <p className="-mt-3 text-xs text-slate-500 dark:text-slate-400">
          Ball natijaga mutanosib beriladi: masalan, 10 balli testda 8/10 toʻgʻri javob — 8 ball.
        </p>

        <ol className="space-y-4">
          {questions.map((question, qi) => (
            <li key={qi} className="rounded-lg border border-slate-200 p-4 dark:border-slate-700">
              <div className="mb-3 flex items-start gap-2">
                <span className="mt-2 w-6 shrink-0 text-sm font-semibold text-slate-500 dark:text-slate-400">{qi + 1}.</span>
                <Input
                  value={question.text}
                  onChange={(e) => updateQuestion(qi, (q) => ({ ...q, text: e.target.value }))}
                  placeholder="She ___ to school every day."
                />
                <button
                  type="button"
                  title="Savolni oʻchirish"
                  disabled={questions.length === 1}
                  onClick={() => setQuestions((prev) => prev.filter((_, i) => i !== qi))}
                  className="mt-2 text-slate-400 hover:text-red-600 disabled:opacity-30 dark:text-slate-500 dark:hover:text-red-400"
                >
                  <Trash2 className="h-4 w-4" />
                </button>
              </div>

              <div className="space-y-2 pl-8">
                {question.options.map((option, oi) => (
                  <div key={oi} className="flex items-center gap-2">
                    <input
                      type="radio"
                      name={`correct-${qi}`}
                      title="Toʻgʻri javob"
                      checked={option.isCorrect}
                      onChange={() =>
                        updateQuestion(qi, (q) => ({
                          ...q,
                          options: q.options.map((o, i) => ({ ...o, isCorrect: i === oi })),
                        }))
                      }
                      className="h-4 w-4 accent-emerald-600"
                    />
                    <span className="w-5 text-sm font-medium text-slate-500 dark:text-slate-400">{LETTERS[oi]})</span>
                    <Input
                      value={option.text}
                      onChange={(e) =>
                        updateQuestion(qi, (q) => ({
                          ...q,
                          options: q.options.map((o, i) => (i === oi ? { ...o, text: e.target.value } : o)),
                        }))
                      }
                      placeholder={`${LETTERS[oi]} variant`}
                      className={option.isCorrect ? 'border-emerald-400 dark:border-emerald-600' : ''}
                    />
                    <button
                      type="button"
                      title="Variantni oʻchirish"
                      disabled={question.options.length <= 2}
                      onClick={() =>
                        updateQuestion(qi, (q) => {
                          const options = q.options.filter((_, i) => i !== oi)
                          // Keep exactly one correct option if the removed one was it.
                          if (!options.some((o) => o.isCorrect)) options[0] = { ...options[0], isCorrect: true }
                          return { ...q, options }
                        })
                      }
                      className="text-slate-400 hover:text-red-600 disabled:opacity-30 dark:text-slate-500 dark:hover:text-red-400"
                    >
                      <Trash2 className="h-4 w-4" />
                    </button>
                  </div>
                ))}
                {question.options.length < MAX_OPTIONS && (
                  <Button
                    type="button"
                    variant="ghost"
                    size="sm"
                    onClick={() => updateQuestion(qi, (q) => ({ ...q, options: [...q.options, { text: '', isCorrect: false }] }))}
                  >
                    <Plus className="h-3.5 w-3.5" /> Variant
                  </Button>
                )}
              </div>
            </li>
          ))}
        </ol>

        <Button type="button" variant="secondary" onClick={() => setQuestions((prev) => [...prev, blankQuestion()])}>
          <Plus className="h-4 w-4" /> Savol qoʻshish
        </Button>

        {error && <p className="text-sm text-red-600 dark:text-red-400">{error}</p>}

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Button type="button" variant="secondary" onClick={onDone}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={saveMutation.isPending}>
            Saqlash
          </Button>
        </div>
      </form>
    </Card>
  )
}
