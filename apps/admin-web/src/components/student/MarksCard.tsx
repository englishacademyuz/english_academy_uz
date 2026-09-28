import { useMemo, useState } from 'react'
import { assessmentTypeLabel, formatLongDate, formatMonthLong, formatWeekRange } from '../../lib/format'
import { startOfMonth, startOfWeek } from '../../lib/dateRange'
import type { StudentOverviewAssessmentResult, StudentOverviewQuizResult } from '../../lib/types'
import { Card, EmptyState, Tabs } from '../ui'
import { PeriodNav } from './PeriodNav'

type PeriodKind = 'day' | 'week' | 'month'

const PERIODS: Array<{ key: PeriodKind; label: string }> = [
  { key: 'day', label: 'Kunlik' },
  { key: 'week', label: 'Haftalik' },
  { key: 'month', label: 'Oylik' },
]

type Mark = {
  id: string
  date: Date
  title: string
  detail: string
  score: number
  max: number
  quiz: boolean
}

function periodStart(kind: PeriodKind, anchor: Date): Date {
  if (kind === 'month') return startOfMonth(anchor)
  if (kind === 'week') return startOfWeek(anchor)
  return new Date(anchor.getFullYear(), anchor.getMonth(), anchor.getDate())
}

function shift(kind: PeriodKind, start: Date, by: number): Date {
  if (kind === 'month') return new Date(start.getFullYear(), start.getMonth() + by, 1)
  return new Date(start.getFullYear(), start.getMonth(), start.getDate() + by * (kind === 'week' ? 7 : 1))
}

function periodLabel(kind: PeriodKind, start: Date): string {
  if (kind === 'month') return formatMonthLong(start)
  if (kind === 'week') return formatWeekRange(start)
  return formatLongDate(start)
}

function tone(percent: number) {
  if (percent >= 80) return { bar: 'bg-emerald-500', text: 'text-emerald-700 dark:text-emerald-400' }
  if (percent >= 60) return { bar: 'bg-amber-400', text: 'text-amber-700 dark:text-amber-400' }
  return { bar: 'bg-red-500', text: 'text-red-700 dark:text-red-400' }
}

/** Every mark -- teacher assessments and Telegram quiz results -- for one chosen day, week, or month, grouped by day. */
export function MarksCard({
  assessmentResults,
  quizResults,
}: {
  assessmentResults: StudentOverviewAssessmentResult[]
  quizResults: StudentOverviewQuizResult[]
}) {
  const now = useMemo(() => new Date(), [])
  const [kind, setKind] = useState<PeriodKind>('month')
  const [start, setStart] = useState(() => periodStart('month', now))
  const end = shift(kind, start, 1)
  const isCurrent = now >= start && now < end

  const marks = useMemo<Mark[]>(
    () =>
      [
        ...assessmentResults.map((r) => ({
          id: r.id,
          date: new Date(r.assessment.date),
          title: r.assessment.title,
          detail: [
            r.assessment.category.name !== r.assessment.title ? r.assessment.category.name : null,
            assessmentTypeLabel[r.assessment.type],
            r.assessment.group.name,
          ]
            .filter(Boolean)
            .join(' · '),
          score: r.score,
          max: r.assessment.maxScore,
          quiz: false,
        })),
        ...quizResults.map((q) => ({
          id: q.id,
          date: new Date(q.date),
          title: q.quizTitle,
          detail: `Test · ${q.group.name} · +${q.points} ball`,
          score: q.correctCount,
          max: q.totalQuestions,
          quiz: true,
        })),
      ].sort((a, b) => b.date.getTime() - a.date.getTime()),
    [assessmentResults, quizResults],
  )

  const inPeriod = marks.filter((m) => m.date >= start && m.date < end)
  const byDay: Array<{ date: Date; marks: Mark[] }> = []
  for (const mark of inPeriod) {
    const last = byDay[byDay.length - 1]
    if (last && last.date.toDateString() === mark.date.toDateString()) last.marks.push(mark)
    else byDay.push({ date: mark.date, marks: [mark] })
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Baholar</h2>
        <Tabs
          tabs={PERIODS}
          active={kind}
          onChange={(next) => {
            setKind(next)
            setStart(periodStart(next, isCurrent ? now : start))
          }}
          size="xs"
          variant="segmented"
        />
      </div>

      <div className="mb-4 flex items-center justify-between gap-2">
        <PeriodNav
          label={periodLabel(kind, start)}
          onPrev={() => setStart(shift(kind, start, -1))}
          onNext={() => setStart(shift(kind, start, 1))}
          canGoNext={!isCurrent}
          onCurrent={isCurrent ? undefined : () => setStart(periodStart(kind, now))}
          currentLabel={kind === 'month' ? 'Joriy oy' : kind === 'week' ? 'Joriy hafta' : 'Bugun'}
        />
        <span className="text-xs text-slate-500 dark:text-slate-400">{inPeriod.length} ta baho</span>
      </div>

      {byDay.length === 0 ? (
        <EmptyState title="Bu davrda baho yoʻq" />
      ) : (
        <div className="max-h-[28rem] space-y-4 overflow-y-auto pr-1">
          {byDay.map(({ date, marks: dayMarks }) => (
            <section key={date.toDateString()}>
              {kind !== 'day' && (
                <h3 className="mb-1.5 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  {formatLongDate(date)}
                </h3>
              )}
              <ul className="space-y-2">
                {dayMarks.map((mark) => {
                  const percent = mark.max ? Math.round((mark.score / mark.max) * 100) : 0
                  const t = tone(percent)
                  return (
                    <li key={mark.id} className="rounded-lg bg-slate-50 px-3 py-2.5 dark:bg-slate-800/60">
                      <div className="flex items-center justify-between gap-3">
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-900 dark:text-slate-100">
                            {mark.quiz && '🧠 '}
                            {mark.title}
                          </p>
                          <p className="truncate text-xs text-slate-500 dark:text-slate-400">{mark.detail}</p>
                        </div>
                        <p className={`shrink-0 text-lg font-bold tabular-nums ${t.text}`}>
                          {mark.score}
                          <span className="text-sm font-medium text-slate-400 dark:text-slate-500">/{mark.max}</span>
                        </p>
                      </div>
                      <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-slate-200 dark:bg-slate-700">
                        <div className={`h-full rounded-full ${t.bar}`} style={{ width: `${percent}%` }} />
                      </div>
                    </li>
                  )
                })}
              </ul>
            </section>
          ))}
        </div>
      )}
    </Card>
  )
}
