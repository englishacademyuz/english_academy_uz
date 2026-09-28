import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, ChevronDown, ChevronRight, Pencil, Plus, Send, Square, Trash2 } from 'lucide-react'
import { quizzes as quizzesApi } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Group, QuizDetail, QuizSummary } from '../../lib/types'
import { Badge, Button, Card, EmptyState, Input, Spinner } from '../ui'
import { QuizEditor } from './QuizEditor'

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

function pad(n: number) {
  return String(n).padStart(2, '0')
}

/** `datetime-local` value in the browser's local time. */
function toDateTimeLocal(date: Date) {
  return `${date.getFullYear()}-${pad(date.getMonth() + 1)}-${pad(date.getDate())}T${pad(date.getHours())}:${pad(date.getMinutes())}`
}

/** A daily quiz is due by the end of today; after 23:00 that's too tight, so tomorrow night instead. */
function defaultDeadline(now = new Date()) {
  const deadline = new Date(now.getFullYear(), now.getMonth(), now.getDate(), 23, 59)
  if (deadline.getTime() - now.getTime() < 60 * 60 * 1000) deadline.setDate(deadline.getDate() + 1)
  return deadline
}

function formatDateTime(value: string) {
  const date = new Date(value)
  return `${formatDate(date)} ${pad(date.getHours())}:${pad(date.getMinutes())}`
}

function StatusBadge({ quiz }: { quiz: Pick<QuizSummary, 'status' | 'isOpen' | 'deadline'> }) {
  if (quiz.status === 'DRAFT') return <Badge>Qoralama</Badge>
  if (quiz.isOpen) return <Badge tone="green">Ochiq · {formatDateTime(quiz.deadline!)} gacha</Badge>
  return <Badge tone="amber">Yopilgan</Badge>
}

export function QuizTab({ group, initialDate }: { group: Group; initialDate?: Date }) {
  const [expandedId, setExpandedId] = useState<string | null>(null)
  const [editing, setEditing] = useState<{ quiz?: QuizDetail } | null>(null)
  const quizzesQuery = useQuery({
    queryKey: ['group-quizzes', group.id, 'all'],
    queryFn: () => quizzesApi.listForGroup(group.id),
  })

  if (editing) {
    return (
      <QuizEditor
        groupId={group.id}
        initialDate={initialDate ?? new Date()}
        quiz={editing.quiz}
        onDone={() => setEditing(null)}
      />
    )
  }

  const activeCount = group.enrollments?.filter((e) => e.status === 'ACTIVE').length ?? 0

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <div>
          <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Testlar</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Har bir test oʻz darsida saqlanadi. Yuborilgach, guruh oʻquvchilari uni Telegram botda bir marta ishlaydi.
          </p>
        </div>
        <Button onClick={() => setEditing({})}>
          <Plus className="h-4 w-4" /> Yangi test
        </Button>
      </div>

      {quizzesQuery.isLoading ? (
        <Spinner />
      ) : quizzesQuery.data?.length === 0 ? (
        <EmptyState title="Hali testlar yoʻq" description="Birinchi testni yarating va guruhga yuboring." />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {quizzesQuery.data?.map((quiz) => {
            const completed = quiz.attempts.filter((a) => a.completedAt).length
            const expanded = expandedId === quiz.id
            return (
              <li key={quiz.id}>
                <button
                  onClick={() => setExpandedId(expanded ? null : quiz.id)}
                  className="flex w-full items-center justify-between gap-4 py-3 text-left"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                      {formatDate(quiz.date)} — {quiz.title}
                    </p>
                    <div className="mt-1 flex flex-wrap items-center gap-1.5">
                      <StatusBadge quiz={quiz} />
                      <Badge tone="brand">{quiz.questionCount} ta savol</Badge>
                      <Badge tone="gold">{quiz.maxPoints} ball</Badge>
                      {quiz.status === 'SENT' && (
                        <span className="text-xs text-slate-500 dark:text-slate-400">
                          Ishladi: {completed}/{activeCount}
                        </span>
                      )}
                    </div>
                  </div>
                  {expanded ? (
                    <ChevronDown className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                  ) : (
                    <ChevronRight className="h-4 w-4 shrink-0 text-slate-400 dark:text-slate-500" />
                  )}
                </button>
                {expanded && (
                  <div className="pb-4">
                    <QuizDetailPanel
                      groupId={group.id}
                      quizId={quiz.id}
                      onEdit={(detail) => setEditing({ quiz: detail })}
                      onDeleted={() => setExpandedId(null)}
                    />
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

function QuizDetailPanel({
  groupId,
  quizId,
  onEdit,
  onDeleted,
}: {
  groupId: string
  quizId: string
  onEdit: (quiz: QuizDetail) => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const [deadline, setDeadline] = useState(() => toDateTimeLocal(defaultDeadline()))
  const quizQuery = useQuery({
    queryKey: ['quiz', quizId],
    queryFn: () => quizzesApi.get(quizId),
    // Results fill in while the quiz is open -- keep them fresh without a manual reload.
    refetchInterval: (query) => (query.state.data?.isOpen ? 15_000 : false),
  })

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['quiz', quizId] })
    queryClient.invalidateQueries({ queryKey: ['group-quizzes', groupId] })
  }

  const sendMutation = useMutation({
    mutationFn: () => quizzesApi.send(quizId, new Date(deadline).toISOString()),
    onSuccess: (result) => {
      notifySuccess(`Test yuborildi (${result.notifiedChats} ta Telegram hisob)`)
      refresh()
    },
    onError: (err) => notifyError(err, 'Testni yuborib boʻlmadi'),
  })
  const closeMutation = useMutation({
    mutationFn: () => quizzesApi.close(quizId),
    onSuccess: () => {
      notifySuccess('Test yopildi')
      refresh()
    },
    onError: (err) => notifyError(err, 'Testni yopib boʻlmadi'),
  })
  const deleteMutation = useMutation({
    mutationFn: () => quizzesApi.remove(quizId),
    onSuccess: () => {
      notifySuccess('Test oʻchirildi')
      onDeleted()
      queryClient.invalidateQueries({ queryKey: ['group-quizzes', groupId] })
    },
    onError: (err) => notifyError(err, 'Testni oʻchirib boʻlmadi'),
  })

  if (quizQuery.isLoading || !quizQuery.data) return <Spinner />
  const quiz = quizQuery.data
  const total = quiz.questions.length

  return (
    <div className="space-y-4 rounded-lg bg-slate-50 p-4 dark:bg-slate-800/60">
      {quiz.status === 'DRAFT' ? (
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div className="flex gap-2">
            <Button variant="secondary" size="sm" onClick={() => onEdit(quiz)}>
              <Pencil className="h-3.5 w-3.5" /> Tahrirlash
            </Button>
            <Button
              variant="danger"
              size="sm"
              loading={deleteMutation.isPending}
              onClick={() => {
                if (window.confirm('Test oʻchirilsinmi?')) deleteMutation.mutate()
              }}
            >
              <Trash2 className="h-3.5 w-3.5" /> Oʻchirish
            </Button>
          </div>
          <div className="flex items-end gap-2">
            <label className="text-xs text-slate-500 dark:text-slate-400">
              Muddat
              <Input
                type="datetime-local"
                value={deadline}
                onChange={(e) => setDeadline(e.target.value)}
                className="mt-1 w-52"
              />
            </label>
            <Button
              size="sm"
              loading={sendMutation.isPending}
              onClick={() => {
                if (window.confirm('Test guruh oʻquvchilariga yuborilsinmi? Yuborilgach, savollarni oʻzgartirib boʻlmaydi.')) {
                  sendMutation.mutate()
                }
              }}
            >
              <Send className="h-3.5 w-3.5" /> Yuborish
            </Button>
          </div>
        </div>
      ) : (
        <div className="flex flex-wrap items-center justify-between gap-3">
          <StatusBadge quiz={quiz} />
          {quiz.isOpen && (
            <Button
              variant="secondary"
              size="sm"
              loading={closeMutation.isPending}
              onClick={() => {
                if (window.confirm('Test hozir yopilsinmi? Tugatilmagan urinishlar javob berilgan savollar boʻyicha baholanadi.')) {
                  closeMutation.mutate()
                }
              }}
            >
              <Square className="h-3.5 w-3.5" /> Hozir yopish
            </Button>
          )}
        </div>
      )}

      {quiz.status === 'SENT' && (
        <table className="w-full text-sm">
          <thead>
            <tr className="text-left text-xs text-slate-500 dark:text-slate-400">
              <th className="py-1 font-medium">Oʻquvchi</th>
              <th className="py-1 font-medium">Natija</th>
              <th className="py-1 font-medium">%</th>
              <th className="py-1 font-medium">Ball</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-200/70 dark:divide-slate-700/70">
            {quiz.results.map((row) => (
              <tr key={row.student.id}>
                <td className="py-1.5 text-slate-800 dark:text-slate-200">
                  {row.student.firstName} {row.student.lastName}
                </td>
                {row.status === 'COMPLETED' ? (
                  <>
                    <td className="py-1.5 font-semibold text-slate-900 dark:text-slate-100">
                      {row.correctCount}/{total}
                    </td>
                    <td className="py-1.5 text-slate-600 dark:text-slate-400">
                      {total ? Math.round(((row.correctCount ?? 0) / total) * 100) : 0}%
                    </td>
                    <td className="py-1.5 text-slate-600 dark:text-slate-400">+{row.points}</td>
                  </>
                ) : (
                  <td colSpan={3} className="py-1.5 text-xs text-slate-400 dark:text-slate-500">
                    {row.status === 'IN_PROGRESS' ? `Ishlamoqda (${row.answeredCount}/${total})` : 'Boshlamagan'}
                  </td>
                )}
              </tr>
            ))}
          </tbody>
        </table>
      )}

      <ol className="space-y-2">
        {quiz.questions.map((question, i) => (
          <li key={question.id} className="text-sm">
            <p className="font-medium text-slate-800 dark:text-slate-200">
              {i + 1}. {question.text}
            </p>
            <ul className="mt-1 flex flex-wrap gap-x-4 gap-y-1 pl-4">
              {question.options.map((option, oi) => (
                <li
                  key={option.id}
                  className={
                    option.isCorrect
                      ? 'flex items-center gap-1 font-medium text-emerald-700 dark:text-emerald-400'
                      : 'text-slate-600 dark:text-slate-400'
                  }
                >
                  {LETTERS[oi]}) {option.text}
                  {option.isCorrect && <Check className="h-3.5 w-3.5" />}
                </li>
              ))}
            </ul>
          </li>
        ))}
      </ol>
    </div>
  )
}
