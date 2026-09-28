import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { miniApi } from '../api'
import { Card, CardTitle, Empty, ErrorState, LinkCard, Loading, Screen, StatTile } from '../components/kit'
import { averageOf, formatDate, percent, rateTone } from '../format'
import type { ProgressKind } from '../types'

const PERIODS: Array<{ key: ProgressKind; label: string }> = [
  { key: 'today', label: 'Bugun' },
  { key: 'week', label: 'Shu hafta' },
  { key: 'month', label: 'Shu oy' },
]

function barColor(p: number) {
  if (p >= 80) return 'bg-emerald-500'
  if (p >= 60) return 'bg-amber-400'
  return 'bg-red-500'
}

export function ProgressPage() {
  const [kind, setKind] = useState<ProgressKind>('month')
  const progress = useQuery({ queryKey: ['mini', 'progress', kind], queryFn: () => miniApi.progress(kind) })
  const data = progress.data
  const categories = data ? Object.entries(data.academicByCategory) : []
  const marksAverage = averageOf(categories.map(([, v]) => v))

  return (
    <Screen title="Progress" subtitle="Davomat, baholar va testlar">
      <div className="grid grid-cols-3 rounded-2xl bg-slate-100 p-1 dark:bg-slate-900">
        {PERIODS.map((p) => (
          <button
            key={p.key}
            onClick={() => setKind(p.key)}
            className={`rounded-xl py-2 text-sm font-medium transition ${
              kind === p.key
                ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-800 dark:text-white'
                : 'text-slate-500 dark:text-slate-400'
            }`}
          >
            {p.label}
          </button>
        ))}
      </div>

      {progress.isLoading ? (
        <Loading />
      ) : progress.error || !data ? (
        <ErrorState error={progress.error} onRetry={() => progress.refetch()} />
      ) : (
        <>
          <div className="grid grid-cols-2 gap-2">
            <StatTile label="Davomat" value={percent(data.attendanceRate)} tone={rateTone(data.attendanceRate)} />
            <StatTile label="Baholar" value={percent(marksAverage)} tone={rateTone(marksAverage)} empty="Hali baholanmagan" />
            <StatTile label="Testlar" value={percent(data.quizAverage)} tone={rateTone(data.quizAverage)} empty="Hali test yoʻq" />
            <StatTile label="Ball" value={data.points ? `+${data.points}` : null} tone="brand" empty="Hali ball yoʻq" />
          </div>

          {categories.length > 0 && (
            <Card>
              <CardTitle icon="🎯">Yoʻnalishlar boʻyicha</CardTitle>
              <ul className="space-y-3">
                {categories.map(([name, value]) => (
                  <li key={name}>
                    <div className="flex justify-between text-sm">
                      <span className="text-slate-700 dark:text-slate-300">{name}</span>
                      <span className="font-semibold tabular-nums text-slate-900 dark:text-white">{Math.round(value)}%</span>
                    </div>
                    <div className="mt-1 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                      <div className={`h-full rounded-full ${barColor(value)}`} style={{ width: `${Math.round(value)}%` }} />
                    </div>
                  </li>
                ))}
              </ul>
            </Card>
          )}

          <Card>
            <CardTitle icon="📋">Baholar</CardTitle>
            {data.marks.length === 0 ? (
              <Empty icon="📝" title="Bu davrda hali baholanmagan" />
            ) : (
              <ul className="divide-y divide-slate-100 dark:divide-slate-800">
                {data.marks.map((mark) => {
                  const p = mark.maxScore ? Math.round((mark.score / mark.maxScore) * 100) : 0
                  return (
                    <li key={mark.id} className="flex items-center justify-between gap-3 py-2.5">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-900 dark:text-white">
                          {mark.kind === 'quiz' && '🧠 '}
                          {mark.title}
                        </p>
                        <p className="text-xs text-slate-500 dark:text-slate-400">
                          {formatDate(mark.date)}
                          {mark.category !== mark.title && ` · ${mark.category}`}
                        </p>
                      </div>
                      <p className={`shrink-0 text-lg font-bold tabular-nums ${p >= 80 ? 'text-emerald-600' : p >= 60 ? 'text-amber-600' : 'text-red-600'}`}>
                        {mark.score}
                        <span className="text-sm font-medium text-slate-400">/{mark.maxScore}</span>
                      </p>
                    </li>
                  )
                })}
              </ul>
            )}
          </Card>

          <div className="grid gap-2">
            <LinkCard to="/student/attendance">
              <p className="font-semibold text-slate-900 dark:text-white">✅ Davomat tarixi</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Har bir dars boʻyicha</p>
            </LinkCard>
            <LinkCard to="/student/quizzes">
              <p className="font-semibold text-slate-900 dark:text-white">🧠 Testlar</p>
              <p className="text-xs text-slate-500 dark:text-slate-400">Ochiq testlar va natijalar</p>
            </LinkCard>
          </div>
        </>
      )}
    </Screen>
  )
}
