import type { ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { ChevronRight, Loader2 } from 'lucide-react'
import { MiniApiError } from '../api'

/** One screen: a friendly title, optional subtitle, then its cards. */
export function Screen({ title, subtitle, children }: { title: string; subtitle?: ReactNode; children: ReactNode }) {
  return (
    <div className="space-y-4 px-4 pb-6 pt-5">
      <header>
        <h1 className="text-2xl font-bold text-slate-900 dark:text-white">{title}</h1>
        {subtitle && <p className="mt-0.5 text-sm text-slate-500 dark:text-slate-400">{subtitle}</p>}
      </header>
      {children}
    </div>
  )
}

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 dark:bg-slate-900 dark:ring-slate-800 ${className}`}>
      {children}
    </section>
  )
}

export function CardTitle({ icon, children, action }: { icon?: string; children: ReactNode; action?: ReactNode }) {
  return (
    <div className="mb-3 flex items-center justify-between gap-2">
      <h2 className="flex items-center gap-2 text-base font-semibold text-slate-900 dark:text-white">
        {icon && <span aria-hidden>{icon}</span>}
        {children}
      </h2>
      {action}
    </div>
  )
}

/** A whole card that navigates somewhere -- big tap target, chevron on the right. */
export function LinkCard({ to, children, className = '' }: { to: string; children: ReactNode; className?: string }) {
  return (
    <Link
      to={to}
      className={`flex items-center gap-3 rounded-2xl bg-white p-4 shadow-sm ring-1 ring-slate-200/70 active:scale-[0.99] active:bg-slate-50 dark:bg-slate-900 dark:ring-slate-800 dark:active:bg-slate-800 ${className}`}
    >
      <div className="min-w-0 flex-1">{children}</div>
      <ChevronRight className="h-5 w-5 shrink-0 text-slate-300 dark:text-slate-600" />
    </Link>
  )
}

/** "Label: value" row used inside info cards. */
export function InfoRow({ label, children }: { label: string; children: ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3 py-1.5">
      <span className="shrink-0 text-sm text-slate-500 dark:text-slate-400">{label}</span>
      <span className="text-right text-sm font-medium text-slate-900 dark:text-slate-100">{children}</span>
    </div>
  )
}

const TONES = {
  green: 'bg-emerald-50 text-emerald-700 dark:bg-emerald-500/10 dark:text-emerald-300',
  amber: 'bg-amber-50 text-amber-700 dark:bg-amber-500/10 dark:text-amber-300',
  red: 'bg-red-50 text-red-700 dark:bg-red-500/10 dark:text-red-300',
  blue: 'bg-sky-50 text-sky-700 dark:bg-sky-500/10 dark:text-sky-300',
  brand: 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300',
  slate: 'bg-slate-100 text-slate-600 dark:bg-slate-800 dark:text-slate-300',
} as const
export type Tone = keyof typeof TONES

export function Pill({ tone = 'slate', children }: { tone?: Tone; children: ReactNode }) {
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${TONES[tone]}`}>
      {children}
    </span>
  )
}

/** A big number with a label -- shows a friendly "no data" line instead of a misleading 0%. */
export function StatTile({
  label,
  value,
  empty = 'Maʼlumot mavjud emas',
  tone = 'slate',
}: {
  label: string
  value: string | null
  empty?: string
  tone?: Tone
}) {
  return (
    <div className={`rounded-2xl p-3 ${value === null ? TONES.slate : TONES[tone]}`}>
      <p className="text-xs font-medium opacity-80">{label}</p>
      {value === null ? (
        <p className="mt-1 text-sm font-medium">{empty}</p>
      ) : (
        <p className="mt-0.5 text-2xl font-bold tabular-nums">{value}</p>
      )}
    </div>
  )
}

export function Loading() {
  return (
    <div className="flex flex-col items-center justify-center gap-3 py-20 text-slate-400">
      <Loader2 className="h-7 w-7 animate-spin" />
      <p className="text-sm">Yuklanmoqda…</p>
    </div>
  )
}

export function Empty({ icon = '📭', title, hint }: { icon?: string; title: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-dashed border-slate-200 px-4 py-8 text-center dark:border-slate-800">
      <p className="text-3xl" aria-hidden>
        {icon}
      </p>
      <p className="mt-2 text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {hint && <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">{hint}</p>}
    </div>
  )
}

/** Error card with a retry -- the failure is shown, never silently swallowed. */
export function ErrorState({ error, onRetry }: { error: unknown; onRetry?: () => void }) {
  const offline = error instanceof TypeError // fetch() network failure
  const notFound = error instanceof MiniApiError && error.statusCode === 404
  return (
    <div className="rounded-2xl bg-red-50 px-4 py-6 text-center dark:bg-red-500/10">
      <p className="text-3xl" aria-hidden>
        {notFound ? '🔍' : '⚠️'}
      </p>
      <p className="mt-2 text-sm font-medium text-red-800 dark:text-red-200">
        {notFound
          ? 'Maʼlumot topilmadi'
          : offline
            ? 'Internet aloqasini tekshiring'
            : 'Maʼlumotni yuklab boʻlmadi'}
      </p>
      {onRetry && !notFound && (
        <button
          onClick={onRetry}
          className="mt-3 rounded-xl bg-white px-4 py-2 text-sm font-medium text-red-700 shadow-sm dark:bg-slate-900 dark:text-red-300"
        >
          Qayta urinish
        </button>
      )}
    </div>
  )
}
