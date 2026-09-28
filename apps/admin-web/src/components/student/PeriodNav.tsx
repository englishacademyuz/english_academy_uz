import { ChevronLeft, ChevronRight } from 'lucide-react'

/** "◀ label ▶ [Hozir]" strip shared by the student screen's day/week/month views. */
export function PeriodNav({
  label,
  onPrev,
  onNext,
  canGoNext,
  onCurrent,
  currentLabel,
}: {
  label: string
  onPrev: () => void
  onNext: () => void
  canGoNext: boolean
  onCurrent?: () => void
  currentLabel: string
}) {
  const arrow =
    'flex h-7 w-7 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 hover:text-slate-700 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-200'
  return (
    <div className="flex items-center gap-1">
      <button type="button" onClick={onPrev} className={arrow} aria-label="Oldingi">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-[9rem] text-center text-sm font-medium text-slate-800 dark:text-slate-200">{label}</span>
      <button type="button" onClick={onNext} disabled={!canGoNext} className={arrow} aria-label="Keyingi">
        <ChevronRight className="h-4 w-4" />
      </button>
      {onCurrent && (
        <button
          type="button"
          onClick={onCurrent}
          className="ml-1 rounded-md px-2 py-1 text-xs font-medium text-brand-600 hover:bg-brand-50 dark:text-brand-400 dark:hover:bg-brand-500/10"
        >
          {currentLabel}
        </button>
      )}
    </div>
  )
}
