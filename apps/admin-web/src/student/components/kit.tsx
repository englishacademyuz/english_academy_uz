import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronLeft, ChevronRight, Loader2 } from 'lucide-react'
import { MiniApiError } from '../api'

/**
 * The Mini App's building blocks, in the design's language: cream page,
 * white cards with a warm 2px border, big rounded corners, Fredoka headings
 * over Nunito text.
 */

/** One screen: an optional back link, a big title and subtitle, then its sections. */
export function Screen({
  title,
  subtitle,
  back,
  eyebrow,
  children,
}: {
  title?: ReactNode
  subtitle?: ReactNode
  back?: { to: string; label: string }
  /** Small upper-case line above the title (e.g. a lesson's date). */
  eyebrow?: ReactNode
  children: ReactNode
}) {
  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-8 pt-5">
      {back && (
        <Link to={back.to} className="-mb-2 -mt-1 flex min-h-11 items-center gap-1.5 self-start text-base font-extrabold text-tg-blue-dark">
          <ChevronLeft className="h-[22px] w-[22px]" strokeWidth={2.5} />
          {back.label}
        </Link>
      )}
      {(title || subtitle || eyebrow) && (
        <header className="flex flex-col gap-0.5">
          {eyebrow && <span className="text-[13px] font-extrabold uppercase text-tg-blue-dark">{eyebrow}</span>}
          {title && <h1 className="font-tg-display text-[32px] font-semibold leading-[1.1]">{title}</h1>}
          {subtitle && <span className="text-[15px] font-bold text-tg-muted">{subtitle}</span>}
        </header>
      )}
      {children}
    </div>
  )
}

export function SectionTitle({ children }: { children: ReactNode }) {
  return <h2 className="font-tg-display text-[22px] font-semibold leading-tight">{children}</h2>
}

export function Section({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <section className="flex flex-col gap-2.5">
      <SectionTitle>{title}</SectionTitle>
      {children}
    </section>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return <section className={`rounded-3xl border-2 border-tg-line bg-white p-4 ${className}`}>{children}</section>
}

/** A white row that opens another screen -- "Kundalikni ochish ›". */
export function LinkRow({ to, children, className = '' }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={`flex min-h-12 items-center justify-between gap-3 rounded-[18px] border-2 border-tg-line bg-white px-4 py-3.5 text-base font-extrabold text-tg-blue-dark active:scale-[0.99] ${className}`}
    >
      {children}
      <ChevronRight className="h-[22px] w-[22px] shrink-0" strokeWidth={2.5} />
    </Link>
  )
}

/** Upper-case label over a bold value -- "USTOZIM / Umid Teacher". */
export function LabeledValue({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5">
      <span className="text-[13px] font-extrabold uppercase text-tg-muted">{label}</span>
      <span className="truncate text-lg font-extrabold">{children}</span>
    </div>
  )
}

/** A calendar-page square: short weekday over the day number. */
export function DayBadge({ date, size = 'md' }: { date: Date; size?: 'md' | 'lg' }) {
  const DOW = ['YAK', 'DU', 'SE', 'CHOR', 'PAY', 'JU', 'SH']
  return (
    <span
      className={`flex shrink-0 flex-col items-center justify-center rounded-2xl bg-tg-sand leading-none ${
        size === 'lg' ? 'h-14 w-14 rounded-[18px]' : 'h-[54px] w-[54px]'
      }`}
    >
      <span className="text-[11px] font-extrabold text-tg-muted">{DOW[date.getDay()]}</span>
      <span className="mt-1 font-tg-display text-[21px] font-semibold">{date.getDate()}</span>
    </span>
  )
}

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-24 text-tg-muted">
      <Loader2 className="h-8 w-8 animate-spin text-tg-blue" />
      <p className="text-[15px] font-bold">Yuklanmoqda…</p>
    </div>
  )
}

export function Empty({ icon, title, hint }: { icon?: ReactNode; title: string; hint?: string }) {
  return (
    <div className="flex flex-col items-center gap-2 rounded-[22px] border-2 border-tg-line bg-white px-4 py-6 text-center">
      {icon && <span className="text-tg-faint">{icon}</span>}
      <p className="text-[15px] font-bold text-tg-muted">{title}</p>
      {hint && <p className="text-[13px] font-semibold text-tg-faint">{hint}</p>}
    </div>
  )
}

/** Error card with a retry -- the failure is shown, never silently swallowed. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof TypeError // fetch() network failure
  const notFound = error instanceof MiniApiError && error.statusCode === 404
  return (
    <div className="flex flex-col items-center gap-2 rounded-[22px] bg-tg-cherry-soft px-4 py-6 text-center">
      <p className="text-3xl" aria-hidden>
        {notFound ? '🔍' : '⚠️'}
      </p>
      <p className="text-[15px] font-extrabold text-tg-cherry">
        {notFound ? 'Maʼlumot topilmadi' : offline ? 'Internet aloqasini tekshiring' : 'Maʼlumotni yuklab boʻlmadi'}
      </p>
      {onRetry && !notFound && (
        <button onClick={onRetry} className="mt-1 min-h-11 rounded-2xl bg-white px-5 text-[15px] font-extrabold text-tg-cherry">
          Qayta urinish
        </button>
      )}
    </div>
  )
}

/** The screen-wide primary action -- "Darsni ochish", "Boshlash". */
export function BigButton({
  children,
  onClick,
  disabled,
  tone = 'blue',
}: {
  children: ReactNode
  onClick?: () => void
  disabled?: boolean
  tone?: 'blue' | 'green'
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      disabled={disabled}
      className={`min-h-14 w-full rounded-[18px] px-4 text-lg font-extrabold text-white active:scale-[0.99] disabled:opacity-60 ${
        tone === 'green' ? 'bg-tg-leaf' : 'bg-tg-blue'
      }`}
    >
      {children}
    </button>
  )
}
