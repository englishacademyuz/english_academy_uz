import { deadlineLabel, timeLeft, urgencyOf, useNow } from '../deadline'
import { ClockIcon } from './art'

/**
 * A picture task's deadline, as a strip across its card: calm yellow while there's time, red
 * with a live countdown under a day left, a pulsing red one in the last three hours, grey once
 * it has passed.
 */
export function DeadlineBar({ due }: { due: Date }) {
  const now = useNow()
  const urgency = urgencyOf(due, now)
  const look = {
    later: 'bg-tg-sun-soft text-tg-sun-ink',
    soon: 'bg-tg-cherry-soft text-tg-cherry',
    hot: 'bg-tg-cherry text-white',
    overdue: 'bg-tg-sand text-tg-muted',
  }[urgency]
  return (
    <div className={`flex items-center gap-2 px-3.5 py-2 text-[14px] font-extrabold ${look}`}>
      <span className="relative flex shrink-0">
        {urgency === 'hot' && <span className="absolute inset-0 animate-ping rounded-full bg-white/60" />}
        <ClockIcon size={17} strokeWidth={2.6} />
      </span>
      <span className="min-w-0 grow truncate">{urgency === 'overdue' ? 'Muddat oʻtdi' : deadlineLabel(due, now)}</span>
      {(urgency === 'soon' || urgency === 'hot') && (
        <span className="shrink-0 tabular-nums">{timeLeft(due, now)} qoldi</span>
      )}
    </div>
  )
}

/**
 * A small "⏰ 2 soat qoldi" chip for list rows -- only while less than a day is left. Past
 * deadlines get none: a list of old homework all marked overdue would only be noise.
 */
export function DeadlineChip({ due }: { due: Date }) {
  const now = useNow()
  const urgency = urgencyOf(due, now)
  if (urgency !== 'soon' && urgency !== 'hot') return null
  return (
    <span
      className={`self-start rounded-full px-2.5 py-1 text-[13px] font-extrabold tabular-nums ${
        urgency === 'hot' ? 'bg-tg-cherry text-white' : 'bg-tg-cherry-soft text-tg-cherry'
      }`}
    >
      ⏰ {timeLeft(due, now)} qoldi
    </span>
  )
}
