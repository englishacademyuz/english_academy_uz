import {
  formatDate,
  homeworkResultStatusLabel,
  assessmentTypeLabel,
} from '../../lib/format'
import type { StudentOverviewAssessmentResult, StudentOverviewHomeworkResult } from '../../lib/types'
import { Badge, Card, EmptyState } from '../ui'

export function MarksCard({
  assessmentResults,
  homeworkResults,
}: {
  assessmentResults: StudentOverviewAssessmentResult[]
  homeworkResults: StudentOverviewHomeworkResult[]
}) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Baholar</h2>

      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Baholashlar
      </h3>
      {assessmentResults.length === 0 ? (
        <p className="mb-4 text-sm text-slate-400 dark:text-slate-500">Hali baholash natijalari yoʻq.</p>
      ) : (
        <ul className="mb-4 max-h-56 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {assessmentResults.map((result) => {
            const percentage = (result.score / result.assessment.maxScore) * 100
            return (
              <li key={result.id} className="flex items-center justify-between py-2">
                <div>
                  <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{result.assessment.title}</p>
                  <p className="text-xs text-slate-500 dark:text-slate-400">
                    {result.assessment.category.name} · {result.assessment.group.name} ·{' '}
                    {assessmentTypeLabel[result.assessment.type]} · {formatDate(result.assessment.date)}
                  </p>
                </div>
                <div className="flex items-center gap-2">
                  <Badge tone="slate">
                    {result.score}/{result.assessment.maxScore}
                  </Badge>
                  <Badge tone="brand">{percentage.toFixed(0)}%</Badge>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      <h3 className="mb-2 text-xs font-medium uppercase tracking-wide text-slate-400 dark:text-slate-500">
        Uy vazifalari
      </h3>
      {homeworkResults.length === 0 ? (
        <EmptyState title="Hali uy vazifasi natijalari yoʻq" />
      ) : (
        <ul className="max-h-56 divide-y divide-slate-100 overflow-y-auto dark:divide-slate-800">
          {homeworkResults.map((result) => (
            <li key={result.id} className="flex items-center justify-between py-2">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {result.homework.instructions}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {result.homework.lessonSession.group.name} · {formatDate(result.homework.lessonSession.date)}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={result.status === 'COMPLETED' ? 'green' : 'red'}>
                  {homeworkResultStatusLabel[result.status]}
                </Badge>
                {result.score !== null && <Badge tone="slate">{result.score}</Badge>}
              </div>
            </li>
          ))}
        </ul>
      )}
    </Card>
  )
}
