import { useEffect, useState } from 'react'
import { dayMonthYearLabel, formatTime, weekdayName } from '../../lib/format'

/** Sits inline as a PageHeader action, right-aligned next to the page title, rather than taking its own card/row. */
export function LiveClock() {
  const [now, setNow] = useState(() => new Date())

  useEffect(() => {
    const id = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(id)
  }, [])

  return (
    <div className="text-right">
      <p className="font-mono text-2xl font-bold tabular-nums leading-none text-brand-600 dark:text-brand-400">
        {formatTime(now, true)}
      </p>
      <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
        {weekdayName(now)}, {dayMonthYearLabel(now)}
      </p>
    </div>
  )
}
