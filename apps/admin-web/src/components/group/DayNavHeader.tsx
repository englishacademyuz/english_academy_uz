import { ChevronLeft, ChevronRight } from 'lucide-react'
import { formatDayMonthWeekday } from '../../lib/format'

/** The "◀ date ▶ Bugun" strip shared by JournalView and MarksMatrixView's column-header bands. */
export function DayNavHeader({
  selectedDate,
  isSelectedToday,
  canGoNext,
  isFetching,
  onPrev,
  onNext,
  onToday,
}: {
  selectedDate: Date
  isSelectedToday: boolean
  canGoNext: boolean
  isFetching: boolean
  onPrev: () => void
  onNext: () => void
  onToday: () => void
}) {
  return (
    <div className="flex items-center justify-center gap-1.5">
      <button
        type="button"
        onClick={onPrev}
        disabled={isFetching}
        aria-label="Oldingi kun"
        className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800 dark:hover:text-slate-300"
      >
        <ChevronLeft className="h-3.5 w-3.5" />
      </button>
      <span className="text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {formatDayMonthWeekday(selectedDate)}
      </span>
      <button
        type="button"
        onClick={onNext}
        disabled={!canGoNext || isFetching}
        aria-label="Keyingi kun"
        className="flex h-5 w-5 items-center justify-center rounded text-slate-400 hover:bg-slate-100 hover:text-slate-600 disabled:opacity-30 disabled:hover:bg-transparent dark:hover:bg-slate-800 dark:hover:text-slate-300"
      >
        <ChevronRight className="h-3.5 w-3.5" />
      </button>
      {!isSelectedToday && (
        <button
          type="button"
          onClick={onToday}
          className="ml-1 text-[10px] font-semibold text-brand-600 hover:underline dark:text-brand-400"
        >
          Bugun
        </button>
      )}
    </div>
  )
}
