import { useEffect, useMemo, useState } from 'react'
import { useInfiniteQuery, useQuery, useQueryClient } from '@tanstack/react-query'
import { Camera, ChevronLeft, ChevronRight, Mic, Search } from 'lucide-react'
import { homeworkSubmissions as submissionsApi, sessions as sessionsApi } from '../../lib/api'
import { formatDate, formatTime, toDateInputValue } from '../../lib/format'
import { richTextToPlain } from '../../lib/richText'
import type { Group, HomeworkSubmission, HomeworkSubmissionStatus } from '../../lib/types'
import { Badge, Button, Card, EmptyState, Input, Select, Spinner, Tabs } from '../ui'
import { HomeworkPhoto, SubmissionReviewModal, SubmissionStatusBadge, type ReviewItem } from './SubmissionReviewModal'

type Mode = 'lesson' | 'all'

/** How far back the lesson picker reaches -- older submissions are in "Barcha topshiriqlar". */
const LESSON_PICKER_DAYS = 120

/**
 * Uyga vazifalar: homework the group's students handed in through Telegram -- photos and voice notes.
 * "Dars boʻyicha" goes lesson by lesson with the whole roster; "Barcha topshiriqlar" is every
 * submission, newest first, searchable by topic or name and filterable by date and status.
 */
export function HomeworkTab({ group }: { group: Group }) {
  const [mode, setMode] = useState<Mode>('lesson')
  const queryClient = useQueryClient()
  const unchecked = useQuery({
    queryKey: ['homework-unchecked'],
    queryFn: submissionsApi.unchecked,
  })
  const waiting = unchecked.data?.byGroup[group.id] ?? 0

  // A verdict changes the roster, the feed and every badge at once.
  function refresh() {
    queryClient.invalidateQueries({ queryKey: ['homework-lesson'] })
    queryClient.invalidateQueries({ queryKey: ['homework-feed', group.id] })
    queryClient.invalidateQueries({ queryKey: ['homework-unchecked'] })
  }

  return (
    <Card className="p-5">
      <div className="mb-5 flex flex-wrap items-center justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-sm font-semibold text-slate-900 dark:text-slate-100">
            <Camera className="h-4 w-4 text-slate-400" /> Uyga vazifalar
            {waiting > 0 && <Badge tone="amber">{waiting} ta tekshirilmagan</Badge>}
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Oʻquvchilar vazifasini suratga olib, Telegram orqali yuboradi. Tekshirganingizda oʻquvchiga xabar boradi.
          </p>
        </div>
        <Tabs
          variant="segmented"
          tabs={[
            { key: 'lesson' as const, label: 'Dars boʻyicha' },
            { key: 'all' as const, label: 'Barcha topshiriqlar' },
          ]}
          active={mode}
          onChange={setMode}
        />
      </div>

      {mode === 'lesson' ? <ByLesson group={group} onReviewed={refresh} /> : <AllSubmissions group={group} onReviewed={refresh} />}
    </Card>
  )
}

function ByLesson({ group, onReviewed }: { group: Group; onReviewed: () => void }) {
  const from = useMemo(() => toDateInputValue(new Date(Date.now() - LESSON_PICKER_DAYS * 86_400_000)), [])
  const lessonsQuery = useQuery({
    queryKey: ['group-sessions', group.id, 'homework', from],
    queryFn: () => sessionsApi.listForGroup(group.id, { from }),
  })
  // Newest first, only lessons that gave homework.
  const lessons = useMemo(() => (lessonsQuery.data ?? []).filter((s) => s.homework), [lessonsQuery.data])
  const [lessonId, setLessonId] = useState<string | null>(null)
  useEffect(() => {
    if (!lessonId && lessons.length) setLessonId(lessons[0].id)
  }, [lessons, lessonId])

  const roster = useQuery({
    queryKey: ['homework-lesson', lessonId],
    queryFn: () => submissionsApi.forLesson(lessonId!),
    enabled: !!lessonId,
  })
  const [reviewing, setReviewing] = useState<number | null>(null)

  if (lessonsQuery.isLoading) return <Spinner />
  if (lessons.length === 0) {
    return <EmptyState title="Uyga vazifa berilgan darslar yoʻq" description="Darsga uyga vazifa yozilgach, topshiriqlar shu yerda koʻrinadi." />
  }

  const index = lessons.findIndex((l) => l.id === lessonId)
  const rows = roster.data?.students ?? []
  const submitted = rows.filter((r) => r.submission)
  const reviewItems: ReviewItem[] = submitted.map((r) => ({
    submission: r.submission!,
    student: r.student,
    lesson: { date: roster.data!.date, topic: roster.data!.topic, instructions: roster.data!.homework?.instructions },
  }))

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <button
          type="button"
          disabled={index >= lessons.length - 1}
          onClick={() => setLessonId(lessons[index + 1].id)}
          aria-label="Oldingi dars"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
        >
          <ChevronLeft className="h-4 w-4" />
        </button>
        <Select value={lessonId ?? ''} onChange={(e) => setLessonId(e.target.value)} className="max-w-sm">
          {lessons.map((l) => (
            <option key={l.id} value={l.id}>
              {formatDate(l.date)} — {l.topic || 'Mavzusiz'}
            </option>
          ))}
        </Select>
        <button
          type="button"
          disabled={index <= 0}
          onClick={() => setLessonId(lessons[index - 1].id)}
          aria-label="Keyingi dars"
          className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
        >
          <ChevronRight className="h-4 w-4" />
        </button>
        {roster.data && (
          <span className="ml-auto flex flex-wrap gap-1.5 text-xs">
            <Badge tone="brand">
              Topshirdi: {submitted.length}/{rows.length}
            </Badge>
            <Badge tone="amber">Tekshirilmagan: {submitted.filter((r) => r.submission!.status === 'SUBMITTED').length}</Badge>
          </span>
        )}
      </div>

      {roster.data?.homework && (
        <div className="rounded-lg bg-slate-50 px-4 py-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
          <span className="font-medium text-slate-800 dark:text-slate-200">Vazifa: </span>
          {richTextToPlain(roster.data.homework.instructions)}
          {roster.data.homework.dueDate && (
            <span className="text-slate-400"> · muddat {formatDate(roster.data.homework.dueDate)}</span>
          )}
        </div>
      )}

      {roster.isLoading ? (
        <Spinner />
      ) : (
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 text-left text-xs font-medium uppercase tracking-wide text-slate-400 dark:border-slate-800">
                <th className="py-2 pr-4">Oʻquvchi</th>
                <th className="py-2 pr-4">Holat</th>
                <th className="py-2 pr-4">Rasmlar</th>
                <th className="py-2 pr-4">Topshirgan vaqti</th>
                <th className="py-2" />
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
              {rows.map(({ student, submission }) => (
                <tr key={student.id}>
                  <td className="py-2.5 pr-4 font-medium text-slate-800 dark:text-slate-200">
                    {student.firstName} {student.lastName}
                  </td>
                  <td className="py-2.5 pr-4">
                    <SubmissionStatusBadge submission={submission} />
                  </td>
                  <td className="py-2.5 pr-4">
                    {submission ? (
                      <Thumbnails
                        submission={submission}
                        onOpen={() => setReviewing(submitted.findIndex((r) => r.student.id === student.id))}
                      />
                    ) : (
                      <span className="text-slate-300 dark:text-slate-600">—</span>
                    )}
                  </td>
                  <td className="py-2.5 pr-4 text-slate-500 dark:text-slate-400">
                    {submission ? `${formatDate(submission.submittedAt)}, ${formatTime(submission.submittedAt)}` : ''}
                  </td>
                  <td className="py-2.5 text-right">
                    {submission && (
                      <Button
                        size="sm"
                        variant={submission.status === 'SUBMITTED' ? 'primary' : 'secondary'}
                        onClick={() => setReviewing(submitted.findIndex((r) => r.student.id === student.id))}
                      >
                        {submission.status === 'SUBMITTED' ? 'Tekshirish' : 'Koʻrish'}
                      </Button>
                    )}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {reviewing !== null && reviewItems[reviewing] && (
        <SubmissionReviewModal items={reviewItems} startIndex={reviewing} onClose={() => setReviewing(null)} onReviewed={onReviewed} />
      )}
    </div>
  )
}

function AllSubmissions({ group, onReviewed }: { group: Group; onReviewed: () => void }) {
  const [q, setQ] = useState('')
  const [search, setSearch] = useState('')
  const [from, setFrom] = useState('')
  const [to, setTo] = useState('')
  const [status, setStatus] = useState<HomeworkSubmissionStatus | ''>('')
  const [reviewing, setReviewing] = useState<number | null>(null)

  // Typing settles for a moment before the search runs.
  useEffect(() => {
    const timer = setTimeout(() => setSearch(q.trim()), 300)
    return () => clearTimeout(timer)
  }, [q])

  const params = {
    q: search || undefined,
    status: status || undefined,
    from: from ? new Date(`${from}T00:00:00`).toISOString() : undefined,
    // The "to" day is included whole.
    to: to ? new Date(new Date(`${to}T00:00:00`).getTime() + 86_400_000).toISOString() : undefined,
  }
  const feed = useInfiniteQuery({
    queryKey: ['homework-feed', group.id, params],
    queryFn: ({ pageParam }) => submissionsApi.forGroup(group.id, { ...params, page: pageParam }),
    initialPageParam: 0,
    getNextPageParam: (last, pages) => (last.hasMore ? pages.length : undefined),
  })
  const items = useMemo(() => feed.data?.pages.flatMap((p) => p.items) ?? [], [feed.data])
  const reviewItems: ReviewItem[] = items.map((item) => ({ submission: item, student: item.student, lesson: item.lesson }))

  // Grouped under the day they came in.
  const days = useMemo(() => {
    const groups: Array<{ day: string; label: string; entries: Array<{ item: (typeof items)[number]; index: number }> }> = []
    items.forEach((item, index) => {
      const day = new Date(item.submittedAt).toDateString()
      let bucket = groups.at(-1)
      if (!bucket || bucket.day !== day) {
        bucket = { day, label: dayLabelOf(new Date(item.submittedAt)), entries: [] }
        groups.push(bucket)
      }
      bucket.entries.push({ item, index })
    })
    return groups
  }, [items])

  return (
    <div className="space-y-4">
      <div className="grid gap-2 sm:grid-cols-[1fr_auto_auto_auto]">
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input value={q} onChange={(e) => setQ(e.target.value)} placeholder="Mavzu yoki oʻquvchi ismi" className="pl-9" />
        </div>
        <Input type="date" value={from} onChange={(e) => setFrom(e.target.value)} aria-label="Sanadan" title="Sanadan" />
        <Input type="date" value={to} onChange={(e) => setTo(e.target.value)} aria-label="Sanagacha" title="Sanagacha" />
        <Select value={status} onChange={(e) => setStatus(e.target.value as HomeworkSubmissionStatus | '')}>
          <option value="">Barcha holatlar</option>
          <option value="SUBMITTED">Tekshirilmagan</option>
          <option value="RETURNED">Qaytarilgan</option>
          <option value="CHECKED">Tekshirilgan</option>
        </Select>
      </div>

      {feed.isLoading ? (
        <Spinner />
      ) : items.length === 0 ? (
        <EmptyState title="Topshiriqlar topilmadi" description="Filtrlarni oʻzgartirib koʻring." />
      ) : (
        <div className="space-y-5">
          {days.map((day) => (
            <section key={day.day}>
              <h3 className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-400">{day.label}</h3>
              <ul className="divide-y divide-slate-100 rounded-lg border border-slate-200 dark:divide-slate-800 dark:border-slate-800">
                {day.entries.map(({ item, index }) => (
                  <li key={item.id}>
                    <button
                      type="button"
                      onClick={() => setReviewing(index)}
                      className="flex w-full items-center gap-3 px-3 py-2.5 text-left hover:bg-slate-50 dark:hover:bg-slate-800/50"
                    >
                      <span className="relative h-14 w-11 shrink-0 overflow-hidden rounded-md">
                        {item.photos[0] ? (
                          <HomeworkPhoto photoId={item.photos[0].id} className="h-full w-full object-cover" />
                        ) : (
                          <span className="flex h-full w-full items-center justify-center bg-slate-100 text-slate-400 dark:bg-slate-800">
                            <Mic className="h-5 w-5" />
                          </span>
                        )}
                        {item.photos.length > 1 && (
                          <span className="absolute bottom-0.5 right-0.5 rounded bg-black/60 px-1 text-[10px] font-semibold text-white">
                            {item.photos.length}
                          </span>
                        )}
                      </span>
                      <span className="min-w-0 grow">
                        <span className="block truncate text-sm font-medium text-slate-800 dark:text-slate-200">
                          {item.student.firstName} {item.student.lastName}
                        </span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(item.lesson.date)} dars · {item.lesson.topic || 'Mavzusiz'}
                          {item.voices.length > 0 && ` · 🎤 ${item.voices.length}`}
                        </span>
                      </span>
                      <span className="hidden shrink-0 text-xs text-slate-400 sm:block">{formatTime(item.submittedAt)}</span>
                      <span className="shrink-0">
                        <SubmissionStatusBadge submission={item} />
                      </span>
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          ))}
          {feed.hasNextPage && (
            <div className="flex justify-center">
              <Button variant="secondary" loading={feed.isFetchingNextPage} onClick={() => feed.fetchNextPage()}>
                Yana koʻrsatish
              </Button>
            </div>
          )}
        </div>
      )}

      {reviewing !== null && reviewItems[reviewing] && (
        <SubmissionReviewModal items={reviewItems} startIndex={reviewing} onClose={() => setReviewing(null)} onReviewed={onReviewed} />
      )}
    </div>
  )
}

/** Up to four thumbnails, then "+N". */
function Thumbnails({ submission, onOpen }: { submission: HomeworkSubmission; onOpen: () => void }) {
  const shown = submission.photos.slice(0, 4)
  const more = submission.photos.length - shown.length
  return (
    <button type="button" onClick={onOpen} className="flex items-center gap-1">
      {shown.map((p) => (
        <span key={p.id} className="h-10 w-8 overflow-hidden rounded ring-1 ring-slate-200 dark:ring-slate-700">
          <HomeworkPhoto photoId={p.id} className="h-full w-full object-cover" />
        </span>
      ))}
      {more > 0 && <span className="text-xs font-medium text-slate-500">+{more}</span>}
      {submission.voices.length > 0 && (
        <span className="ml-1 flex items-center gap-0.5 text-xs font-medium text-slate-500" title="Ovozli xabarlar">
          <Mic className="h-3.5 w-3.5" /> {submission.voices.length}
        </span>
      )}
    </button>
  )
}

function dayLabelOf(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today.getTime() - 86_400_000)
  if (date.toDateString() === today.toDateString()) return 'Bugun'
  if (date.toDateString() === yesterday.toDateString()) return 'Kecha'
  return formatDate(date)
}
