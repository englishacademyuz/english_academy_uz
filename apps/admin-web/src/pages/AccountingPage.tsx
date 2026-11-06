import { useState, type ReactNode } from 'react'
import { Link } from 'react-router-dom'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, CalendarClock, Check, ChevronLeft, ChevronRight, Pencil, TrendingUp, Wallet } from 'lucide-react'
import { addMonths, tashkentMonth, type BillingMonth } from '@tashkurgan/shared/billing'
import { groups as groupsApi, payments as paymentsApi } from '../lib/api'
import { formatDayMonth, formatMoney, formatMonthYear } from '../lib/format'
import { notifyError, notifySuccess } from '../lib/toast'
import type { Accounting, AccountingLine, AccountingLineState, AccountingSummary, Payment } from '../lib/types'
import { Badge, Button, Card, EmptyState, ErrorBanner, PageHeader, Select, Spinner, Tabs } from '../components/ui'
import { PaymentModal } from '../components/shared/PaymentModal'

const monthIndex = (m: BillingMonth) => m.year * 12 + m.month

/** Share of `part` in `whole`, as a whole percent -- 0 when nothing is expected. */
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)

/** Short money for chart labels: "15,2 mln", "800 ming". */
function shortMoney(amount: number): string {
  if (amount >= 1_000_000) return `${(amount / 1_000_000).toLocaleString('ru-RU', { maximumFractionDigits: 1 })} mln`
  if (amount >= 1_000) return `${Math.round(amount / 1_000)} ming`
  return String(amount)
}

const STATE: Record<AccountingLineState, { label: string; tone: 'green' | 'amber' | 'red' | 'slate' }> = {
  paid: { label: 'Toʻlagan', tone: 'green' },
  partial: { label: 'Qisman', tone: 'amber' },
  unpaid: { label: 'Toʻlamagan', tone: 'red' },
  upcoming: { label: 'Toʻlov kuni kelmagan', tone: 'slate' },
  noFee: { label: 'Narx belgilanmagan', tone: 'slate' },
}

type Filter = 'all' | 'owes' | 'paid' | 'upcoming'
const FILTERS: Array<{ key: Filter; label: string }> = [
  { key: 'all', label: 'Hammasi' },
  { key: 'owes', label: 'Qarzdorlar' },
  { key: 'upcoming', label: 'Kutilmoqda' },
  { key: 'paid', label: 'Toʻlaganlar' },
]
const inFilter: Record<Filter, (l: AccountingLine) => boolean> = {
  all: () => true,
  owes: (l) => l.state === 'unpaid' || l.state === 'partial',
  upcoming: (l) => l.state === 'upcoming',
  paid: (l) => l.state === 'paid',
}

/**
 * Moliya: for a month, what the center should have brought in, what it did, and the gap -- with
 * every student's payment, so the teacher can mark someone paid right here. An admin sees the
 * whole center, a teacher their own groups. Money is counted by the month it pays for.
 */
export function AccountingPage() {
  const current = tashkentMonth()
  const [month, setMonth] = useState<BillingMonth>(current)
  const [groupId, setGroupId] = useState('')

  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const accountingQuery = useQuery({
    queryKey: ['accounting', month.year, month.month, groupId],
    queryFn: () => paymentsApi.accounting(month.year, month.month, groupId || undefined),
  })

  // The month ahead can be opened too -- to see who's due next.
  const canGoNext = monthIndex(month) < monthIndex(addMonths(current, 1))
  const isCurrent = monthIndex(month) === monthIndex(current)

  return (
    <div className="space-y-6">
      <PageHeader
        title="Moliya"
        description="Har oy qancha tushishi kerak, qancha tushdi va kim toʻlamagan"
        actions={
          <>
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} className="w-auto min-w-44">
              <option value="">Barcha guruhlar</option>
              {(groupsQuery.data ?? []).map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
            <MonthPicker
              month={month}
              canGoNext={canGoNext}
              isCurrent={isCurrent}
              onChange={setMonth}
              onCurrent={() => setMonth(current)}
            />
          </>
        }
      />

      {accountingQuery.isLoading ? (
        <Spinner />
      ) : accountingQuery.error || !accountingQuery.data ? (
        <ErrorBanner message="Maʼlumotlarni yuklab boʻlmadi" />
      ) : (
        <AccountingView data={accountingQuery.data} onPickGroup={(id) => setGroupId(id)} showGroups={!groupId} />
      )}
    </div>
  )
}

function MonthPicker({
  month,
  canGoNext,
  isCurrent,
  onChange,
  onCurrent,
}: {
  month: BillingMonth
  canGoNext: boolean
  isCurrent: boolean
  onChange: (m: BillingMonth) => void
  onCurrent: () => void
}) {
  const arrow =
    'flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800'
  return (
    <div className="flex items-center gap-1 rounded-lg border border-slate-300 bg-white px-1 dark:border-slate-700 dark:bg-slate-900">
      <button type="button" className={arrow} onClick={() => onChange(addMonths(month, -1))} aria-label="Oldingi oy">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-28 text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
        {formatMonthYear(month.month, month.year)}
      </span>
      <button
        type="button"
        className={arrow}
        onClick={() => onChange(addMonths(month, 1))}
        disabled={!canGoNext}
        aria-label="Keyingi oy"
      >
        <ChevronRight className="h-4 w-4" />
      </button>
      {!isCurrent && (
        <button type="button" onClick={onCurrent} className="px-2 text-xs font-semibold text-brand-600 hover:underline dark:text-brand-400">
          Joriy oy
        </button>
      )}
    </div>
  )
}

function AccountingView({
  data,
  onPickGroup,
  showGroups,
}: {
  data: Accounting
  onPickGroup: (groupId: string) => void
  showGroups: boolean
}) {
  const { summary, month } = data
  return (
    <>
      <SummaryCards summary={summary} month={month} forecast={data.forecast} totalDebt={data.totalDebt} debtors={data.debtors.length} />
      {summary.noFee > 0 && (
        <div className="flex items-center gap-2 rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          <AlertTriangle className="h-4 w-4 shrink-0" />
          {summary.noFee} ta oʻquvchining guruhida oylik narx belgilanmagan — ular hisobga kirmayapti. Guruhni tahrirlab narxni kiriting.
        </div>
      )}
      <TrendChart trend={data.trend} />
      {showGroups && data.groups.length > 1 && <GroupTable groups={data.groups} onPick={onPickGroup} />}
      <StudentTable lines={data.lines} month={month} />
      {data.debtors.length > 0 && <DebtorList debtors={data.debtors} />}
    </>
  )
}

function SummaryCards({
  summary,
  month,
  forecast,
  totalDebt,
  debtors,
}: {
  summary: AccountingSummary
  month: BillingMonth
  forecast: Accounting['forecast']
  totalDebt: number
  debtors: number
}) {
  const share = percent(summary.collected, summary.expected)
  const notDue = summary.missing - summary.overdue
  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-4">
      <StatCard icon={Wallet} label={`${formatMonthYear(month.month, month.year)} — tushdi`}>
        <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatMoney(summary.collected)}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Kutilgan: <span className="font-medium tabular-nums text-slate-700 dark:text-slate-300">{formatMoney(summary.expected)}</span>
        </p>
        <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(share, 100)}%` }} />
        </div>
        <p className="mt-1 text-xs font-medium text-slate-500 dark:text-slate-400">{share}% yigʻildi</p>
      </StatCard>

      <StatCard icon={AlertTriangle} label="Yetishmayapti" tone={summary.missing > 0 ? 'red' : 'slate'}>
        <p className={`text-2xl font-semibold tabular-nums ${summary.missing > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
          {formatMoney(summary.missing)}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Muddati oʻtgan: <span className="font-medium tabular-nums">{formatMoney(summary.overdue)}</span>
        </p>
        {notDue > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Toʻlov kuni kelmagan: <span className="font-medium tabular-nums">{formatMoney(notDue)}</span>
          </p>
        )}
        <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
          {summary.paid} toʻlagan · {summary.partial} qisman · {summary.unpaid} toʻlamagan
          {summary.upcoming > 0 && ` · ${summary.upcoming} kutilmoqda`}
        </p>
      </StatCard>

      <StatCard icon={TrendingUp} label={`${formatMonthYear(forecast.month, forecast.year)} — kutilmoqda`}>
        <p className="text-2xl font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatMoney(forecast.expected)}</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{forecast.students} ta oʻquvchidan, hozirgi roʻyxat boʻyicha</p>
        {forecast.collected > 0 && (
          <p className="text-xs text-slate-500 dark:text-slate-400">
            Oldindan toʻlangan: <span className="font-medium tabular-nums">{formatMoney(forecast.collected)}</span>
          </p>
        )}
      </StatCard>

      <StatCard icon={CalendarClock} label="Umumiy qarzdorlik" tone={totalDebt > 0 ? 'red' : 'slate'}>
        <p className={`text-2xl font-semibold tabular-nums ${totalDebt > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'}`}>
          {formatMoney(totalDebt)}
        </p>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          {debtors > 0 ? `${debtors} ta oʻquvchi, barcha oylar boʻyicha` : 'Hech kim qarzdor emas'}
        </p>
      </StatCard>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  tone = 'slate',
  children,
}: {
  icon: typeof Wallet
  label: string
  tone?: 'slate' | 'red'
  children: ReactNode
}) {
  return (
    <Card className="flex flex-col gap-1 p-5">
      <div className="mb-1 flex items-center gap-2">
        <span
          className={`flex h-7 w-7 items-center justify-center rounded-lg ${
            tone === 'red' ? 'bg-red-50 text-red-600 dark:bg-red-500/10 dark:text-red-400' : 'bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300'
          }`}
        >
          <Icon className="h-4 w-4" />
        </span>
        <span className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">{label}</span>
      </div>
      {children}
    </Card>
  )
}

/**
 * Six months side by side: the pale track is what each month should have brought in, the filled
 * part what it did -- the empty top of a bar is that month's shortfall. One scale for all.
 */
function TrendChart({ trend }: { trend: Accounting['trend'] }) {
  const [hover, setHover] = useState<number | null>(null)
  const max = Math.max(1, ...trend.map((t) => Math.max(t.expected, t.collected)))
  const HEIGHT = 180

  return (
    <Card className="p-5">
      <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Oxirgi 6 oy</h2>
        <div className="flex items-center gap-4 text-xs text-slate-600 dark:text-slate-300">
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-slate-200 dark:bg-slate-700" /> Kutilgan
          </span>
          <span className="flex items-center gap-1.5">
            <span className="h-3 w-3 rounded-sm bg-brand-500" /> Tushgan
          </span>
        </div>
      </div>

      <div className="grid grid-cols-6 gap-2 sm:gap-4">
        {trend.map((t, i) => {
          const expectedH = (t.expected / max) * HEIGHT
          const collectedH = (t.collected / max) * HEIGHT
          const shown = hover === i
          return (
            <div
              key={`${t.year}-${t.month}`}
              className="relative flex flex-col items-center gap-2"
              onMouseEnter={() => setHover(i)}
              onMouseLeave={() => setHover(null)}
              onFocus={() => setHover(i)}
              onBlur={() => setHover(null)}
              tabIndex={0}
              aria-label={`${formatMonthYear(t.month, t.year)}: kutilgan ${formatMoney(t.expected)}, tushgan ${formatMoney(t.collected)}`}
            >
              <span className="text-[11px] font-medium tabular-nums text-slate-500 dark:text-slate-400">
                {t.expected > 0 ? `${percent(t.collected, t.expected)}%` : '—'}
              </span>
              <div className="relative flex w-full max-w-14 items-end justify-center" style={{ height: HEIGHT }}>
                <div
                  className={`absolute bottom-0 w-full rounded-t-[4px] ${shown ? 'bg-slate-300 dark:bg-slate-600' : 'bg-slate-200 dark:bg-slate-700'}`}
                  style={{ height: expectedH }}
                />
                <div className="absolute bottom-0 w-full rounded-t-[4px] bg-brand-500" style={{ height: collectedH }} />
              </div>
              <span className="text-xs font-medium text-slate-600 dark:text-slate-300">{formatMonthYear(t.month, t.year).split(' ')[0]}</span>
              {shown && (
                <div className="pointer-events-none absolute -top-2 left-1/2 z-10 w-48 -translate-x-1/2 -translate-y-full rounded-lg border border-slate-200 bg-white p-3 text-xs shadow-lg dark:border-slate-700 dark:bg-slate-900">
                  <p className="mb-1 font-semibold text-slate-900 dark:text-slate-100">{formatMonthYear(t.month, t.year)}</p>
                  <TipRow label="Kutilgan" value={t.expected} />
                  <TipRow label="Tushgan" value={t.collected} />
                  <TipRow label="Yetishmadi" value={Math.max(t.expected - t.collected, 0)} />
                </div>
              )}
            </div>
          )
        })}
      </div>
      <p className="mt-3 text-xs text-slate-500 dark:text-slate-400">
        Eng yuqori: {shortMoney(max)} soʻm. Pul qaysi oy uchun toʻlangan boʻlsa, oʻsha oyga yoziladi.
      </p>
    </Card>
  )
}

function TipRow({ label, value }: { label: string; value: number }) {
  return (
    <p className="flex justify-between gap-2 text-slate-600 dark:text-slate-300">
      <span>{label}</span>
      <span className="font-medium tabular-nums text-slate-900 dark:text-slate-100">{formatMoney(value)}</span>
    </p>
  )
}

function GroupTable({ groups, onPick }: { groups: Accounting['groups']; onPick: (groupId: string) => void }) {
  return (
    <Card className="overflow-hidden">
      <h2 className="px-5 pt-5 text-sm font-semibold text-slate-900 dark:text-slate-100">Guruhlar boʻyicha</h2>
      <div className="overflow-x-auto">
        <table className="mt-3 w-full min-w-[560px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500 dark:border-slate-800 dark:text-slate-400">
              <th className="px-5 py-2 font-semibold">Guruh</th>
              <th className="px-3 py-2 text-right font-semibold">Oʻquvchi</th>
              <th className="px-3 py-2 text-right font-semibold">Kutilgan</th>
              <th className="px-3 py-2 text-right font-semibold">Tushgan</th>
              <th className="px-3 py-2 text-right font-semibold">Yetishmayapti</th>
              <th className="px-5 py-2 font-semibold">Yigʻildi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {groups.map((g) => {
              const share = percent(g.collected, g.expected)
              return (
                <tr
                  key={g.groupId ?? 'none'}
                  onClick={() => g.groupId && onPick(g.groupId)}
                  className={g.groupId ? 'cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50' : ''}
                >
                  <td className="px-5 py-2.5 font-medium text-slate-900 dark:text-slate-100">{g.groupName ?? 'Guruhsiz'}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{g.students}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-600 dark:text-slate-300">{formatMoney(g.expected)}</td>
                  <td className="px-3 py-2.5 text-right tabular-nums text-slate-900 dark:text-slate-100">{formatMoney(g.collected)}</td>
                  <td className={`px-3 py-2.5 text-right tabular-nums ${g.missing > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-400'}`}>
                    {formatMoney(g.missing)}
                  </td>
                  <td className="px-5 py-2.5">
                    <div className="flex items-center gap-2">
                      <div className="h-1.5 w-20 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className="h-full rounded-full bg-brand-500" style={{ width: `${Math.min(share, 100)}%` }} />
                      </div>
                      <span className="text-xs tabular-nums text-slate-500 dark:text-slate-400">{share}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
          </tbody>
        </table>
      </div>
    </Card>
  )
}

/** A Payment-shaped object for the edit form, from a line that has a recorded payment. */
function asPayment(line: AccountingLine, month: BillingMonth): Payment {
  return {
    id: line.paymentId!,
    studentId: line.studentId,
    year: month.year,
    month: month.month,
    amountDue: line.amountDue,
    amountPaid: line.amountPaid,
    status: line.state === 'paid' ? 'PAID' : line.state === 'partial' ? 'PARTIAL' : 'DEBT',
    paidAt: null,
    recordedByUserId: '',
    note: line.note,
    createdAt: '',
  }
}

function StudentTable({ lines, month }: { lines: AccountingLine[]; month: BillingMonth }) {
  const [filter, setFilter] = useState<Filter>('all')
  const [editing, setEditing] = useState<AccountingLine | null>(null)
  const queryClient = useQueryClient()
  const shown = lines.filter(inFilter[filter])

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['accounting'] })
    queryClient.invalidateQueries({ queryKey: ['group-payments-history'] })
    queryClient.invalidateQueries({ queryKey: ['students'] })
  }

  // "Toʻlandi": records the month as paid in full, in one click.
  const markPaid = useMutation({
    mutationFn: (line: AccountingLine) =>
      line.paymentId
        ? paymentsApi.update(line.paymentId, { amountPaid: line.amountDue })
        : paymentsApi.record(line.studentId, { ...month, amountDue: line.amountDue, amountPaid: line.amountDue }),
    onSuccess: (_, line) => {
      notifySuccess(`${line.studentName} — toʻlandi`)
      refresh()
    },
    onError: (err) => notifyError(err, 'Toʻlovni saqlab boʻlmadi'),
  })

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          Oʻquvchilar · {formatMonthYear(month.month, month.year)}
        </h2>
        <Tabs
          tabs={FILTERS.map((f) => ({ key: f.key, label: `${f.label} (${lines.filter(inFilter[f.key]).length})` }))}
          active={filter}
          onChange={setFilter}
          size="xs"
          variant="segmented"
        />
      </div>

      {shown.length === 0 ? (
        <div className="p-5">
          <EmptyState title="Bu yerda hech kim yoʻq" />
        </div>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {shown.map((line) => {
            const left = Math.max(line.amountDue - line.amountPaid, 0)
            const look = STATE[line.state]
            const canMark = line.state !== 'paid' && line.amountDue > 0
            return (
              <li key={line.studentId} className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
                <div className="min-w-0 grow basis-48">
                  <Link
                    to={`/students/${line.studentId}`}
                    className="block truncate text-sm font-medium text-slate-900 hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-400"
                  >
                    {line.studentName}
                  </Link>
                  <p className="truncate text-xs text-slate-500 dark:text-slate-400">
                    {line.groupName ?? 'Guruhsiz'} · toʻlov kuni {formatDayMonth(line.dueDate)}
                    {line.note ? ` · ${line.note}` : ''}
                  </p>
                </div>
                <div className="text-right text-sm tabular-nums">
                  <p className="font-medium text-slate-900 dark:text-slate-100">
                    {formatMoney(line.amountPaid)} <span className="text-slate-400">/ {formatMoney(line.amountDue)}</span>
                  </p>
                  {left > 0 && line.state === 'partial' && (
                    <p className="text-xs text-red-600 dark:text-red-400">qarz {formatMoney(left)}</p>
                  )}
                </div>
                <Badge tone={look.tone}>{look.label}</Badge>
                <div className="flex items-center gap-1">
                  {canMark && (
                    <Button
                      size="sm"
                      variant="secondary"
                      onClick={() => markPaid.mutate(line)}
                      loading={markPaid.isPending && markPaid.variables?.studentId === line.studentId}
                      title={`${formatMoney(line.amountDue)} toʻliq toʻlandi deb belgilash`}
                    >
                      <Check className="h-3.5 w-3.5" /> Toʻlandi
                    </Button>
                  )}
                  <Button size="sm" variant="ghost" onClick={() => setEditing(line)} aria-label="Toʻlovni tahrirlash">
                    <Pencil className="h-3.5 w-3.5" />
                  </Button>
                </div>
              </li>
            )
          })}
        </ul>
      )}

      {editing && (
        <PaymentModal
          studentId={editing.studentId}
          studentName={editing.studentName}
          initialYear={month.year}
          initialMonth={month.month}
          existing={editing.paymentId ? asPayment(editing, month) : null}
          fee={editing.amountDue}
          onClose={() => setEditing(null)}
          onSaved={() => {
            refresh()
            setEditing(null)
          }}
        />
      )}
    </Card>
  )
}

function DebtorList({ debtors }: { debtors: Accounting['debtors'] }) {
  return (
    <Card className="p-5">
      <h2 className="mb-3 text-sm font-semibold text-slate-900 dark:text-slate-100">Qarzdorlar — barcha oylar boʻyicha</h2>
      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {debtors.map((d) => (
          <li key={d.studentId} className="flex items-center justify-between gap-3 py-2.5">
            <div className="min-w-0">
              <Link
                to={`/students/${d.studentId}`}
                className="block truncate text-sm font-medium text-slate-900 hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-400"
              >
                {d.studentName}
              </Link>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {d.groupName ?? 'Guruhsiz'} · {d.months} oy toʻlanmagan
              </p>
            </div>
            <span className="shrink-0 text-sm font-semibold tabular-nums text-red-600 dark:text-red-400">{formatMoney(d.amount)}</span>
          </li>
        ))}
      </ul>
    </Card>
  )
}
