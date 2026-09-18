import { Loader2, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import type { ButtonHTMLAttributes, InputHTMLAttributes, ReactNode, SelectHTMLAttributes } from 'react'

export function Card({ children, className = '' }: { children: ReactNode; className?: string }) {
  return (
    <div
      className={`rounded-xl border border-slate-200 bg-white shadow-sm dark:border-slate-800 dark:bg-slate-900 ${className}`}
    >
      {children}
    </div>
  )
}

export function PageHeader({
  title,
  description,
  actions,
}: {
  title: string
  description?: string
  actions?: ReactNode
}) {
  return (
    <div className="mb-6 flex flex-wrap items-start justify-between gap-4">
      <div>
        <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{title}</h1>
        {description && <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">{description}</p>}
      </div>
      {actions && <div className="flex shrink-0 gap-2">{actions}</div>}
    </div>
  )
}

const buttonVariants = {
  primary: 'bg-brand-600 text-white hover:bg-brand-700 focus-visible:outline-brand-600',
  secondary:
    'bg-white text-slate-700 border border-slate-300 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:border-slate-700 dark:hover:bg-slate-800',
  ghost: 'text-slate-600 hover:bg-slate-100 dark:text-slate-400 dark:hover:bg-slate-800',
  danger:
    'bg-white text-red-600 border border-red-200 hover:bg-red-50 dark:bg-slate-900 dark:text-red-400 dark:border-red-900/50 dark:hover:bg-red-950/40',
}

export function Button({
  variant = 'primary',
  loading = false,
  className = '',
  children,
  disabled,
  ...props
}: ButtonHTMLAttributes<HTMLButtonElement> & {
  variant?: keyof typeof buttonVariants
  loading?: boolean
}) {
  return (
    <button
      className={`inline-flex items-center justify-center gap-2 rounded-lg px-3.5 py-2 text-sm font-medium transition-colors focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 disabled:cursor-not-allowed disabled:opacity-50 ${buttonVariants[variant]} ${className}`}
      disabled={disabled || loading}
      {...props}
    >
      {loading && <Loader2 className="h-4 w-4 animate-spin" />}
      {children}
    </button>
  )
}

export function Input({ className = '', ...props }: InputHTMLAttributes<HTMLInputElement>) {
  return (
    <input
      className={`w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-900 placeholder:text-slate-400 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:placeholder:text-slate-500 dark:focus:ring-brand-500/20 ${className}`}
      {...props}
    />
  )
}

export function Select({ className = '', children, ...props }: SelectHTMLAttributes<HTMLSelectElement>) {
  return (
    <select
      className={`w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-2 focus:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:text-slate-100 dark:focus:ring-brand-500/20 ${className}`}
      {...props}
    >
      {children}
    </select>
  )
}

export function Field({ label, children }: { label: string; children: ReactNode }) {
  return (
    <label className="block">
      <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">{label}</span>
      {children}
    </label>
  )
}

const badgeTones: Record<string, string> = {
  green: 'bg-emerald-50 text-emerald-700 ring-emerald-600/20 dark:bg-emerald-500/10 dark:text-emerald-400 dark:ring-emerald-400/20',
  red: 'bg-red-50 text-red-700 ring-red-600/10 dark:bg-red-500/10 dark:text-red-400 dark:ring-red-400/20',
  amber: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-400 dark:ring-amber-400/20',
  slate: 'bg-slate-100 text-slate-600 ring-slate-500/10 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-400/10',
  brand: 'bg-brand-50 text-brand-700 ring-brand-600/20 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400/20',
  gold: 'bg-yellow-100 text-yellow-800 ring-yellow-600/30 dark:bg-yellow-500/10 dark:text-yellow-400 dark:ring-yellow-400/20',
}

export function Badge({ tone = 'slate', children }: { tone?: keyof typeof badgeTones; children: ReactNode }) {
  return (
    <span
      className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-medium ring-1 ring-inset ${badgeTones[tone]}`}
    >
      {children}
    </span>
  )
}

export function Tabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; icon?: LucideIcon }>
  active: T
  onChange: (key: T) => void
}) {
  return (
    <div className="flex flex-wrap gap-2">
      {tabs.map((tab) => (
        <button
          key={tab.key}
          onClick={() => onChange(tab.key)}
          className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
            active === tab.key
              ? 'bg-brand-600 text-white'
              : 'bg-white dark:bg-slate-900 text-slate-600 dark:text-slate-400 ring-1 ring-inset ring-slate-200 dark:ring-slate-700 hover:bg-slate-50 dark:hover:bg-slate-800'
          }`}
        >
          {tab.icon && <tab.icon className="h-3.5 w-3.5" />}
          {tab.label}
        </button>
      ))}
    </div>
  )
}

/** Primary page-section switcher (e.g. a detail page's top-level views) -- an underlined nav bar, distinct from the pill-style `Tabs` used for filters. */
export function PageTabs<T extends string>({
  tabs,
  active,
  onChange,
}: {
  tabs: Array<{ key: T; label: string; icon?: LucideIcon }>
  active: T
  onChange: (key: T) => void
}) {
  return (
    <div className="border-b border-slate-200 dark:border-slate-800">
      <nav className="-mb-px flex gap-6">
        {tabs.map((tab) => (
          <button
            key={tab.key}
            onClick={() => onChange(tab.key)}
            className={`inline-flex items-center gap-1.5 border-b-2 px-0.5 pb-3 text-sm font-medium transition-colors ${
              active === tab.key
                ? 'border-brand-600 text-brand-600 dark:border-brand-400 dark:text-brand-400'
                : 'border-transparent text-slate-500 hover:border-slate-300 hover:text-slate-700 dark:text-slate-400 dark:hover:border-slate-600 dark:hover:text-slate-300'
            }`}
          >
            {tab.icon && <tab.icon className="h-4 w-4" />}
            {tab.label}
          </button>
        ))}
      </nav>
    </div>
  )
}

export function Spinner({ label = 'Yuklanmoqda…' }: { label?: string }) {
  return (
    <div className="flex items-center justify-center gap-2 py-12 text-sm text-slate-500 dark:text-slate-400">
      <Loader2 className="h-4 w-4 animate-spin" />
      {label}
    </div>
  )
}

export function EmptyState({ title, description }: { title: string; description?: string }) {
  return (
    <div className="flex flex-col items-center justify-center gap-1 py-12 text-center">
      <p className="text-sm font-medium text-slate-700 dark:text-slate-300">{title}</p>
      {description && <p className="text-sm text-slate-400 dark:text-slate-500">{description}</p>}
    </div>
  )
}

export function Modal({
  title,
  onClose,
  children,
}: {
  title: string
  onClose: () => void
  children: ReactNode
}) {
  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 px-4 dark:bg-slate-950/60">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl dark:bg-slate-900">
        <div className="mb-4 flex items-center justify-between">
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">{title}</h2>
          <button
            onClick={onClose}
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:text-slate-500 dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        {children}
      </div>
    </div>
  )
}

export function ErrorBanner({ message }: { message: string }) {
  return (
    <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700 dark:border-red-900/50 dark:bg-red-500/10 dark:text-red-400">
      {message}
    </div>
  )
}
