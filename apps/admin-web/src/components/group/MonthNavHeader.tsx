import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatMonthYear } from '../../lib/format'

/** Month-level counterpart to DayNavHeader -- the "◀ month ▶ Joriy oy" strip for
 * PaymentsMatrixView, which browses one calendar month of payments at a time. */
export function MonthNavHeader({
  year,
  month,
  isCurrentMonth,
  onPrev,
  onNext,
  onCurrent,
}: {
  year: number
  month: number
  isCurrentMonth: boolean
  onPrev: () => void
  onNext: () => void
  onCurrent: () => void
}) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={onPrev}
        aria-label="Oldingi oy"
        className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {formatMonthYear(month, year)}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={isCurrentMonth}
        aria-label="Keyingi oy"
        className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800 dark:hover:text-slate-300"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      {!isCurrentMonth && (
        <button
          type="button"
          onClick={onCurrent}
          className="ml-1 text-[10px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          Joriy oy
        </button>
      )}
    </div>
  )
}
