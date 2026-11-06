import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { Bell, Check, ChevronLeft, ChevronRight, TrendingDown, TrendingUp } from 'lucide-react'
import { addMonths, calendarDayOf, daysBetween, tashkentMonth, type BillingMonth } from '@tashkurgan/shared/billing'
import { payments as paymentsApi } from '../lib/api'
import { UZ_MONTHS, formatDayMonth, formatMonthYear } from '../lib/format'
import { notifySuccess } from '../lib/toast'
import type { Accounting, AccountingGroup, AccountingLine, AccountingPrevious, AccountingSummary, Payment } from '../lib/types'
import { Button, Card, EmptyState, ErrorBanner, Spinner } from '../components/ui'
import { PaymentModal } from '../components/shared/PaymentModal'

const monthIndex = (m: BillingMonth) => m.year * 12 + m.month
const percent = (part: number, whole: number) => (whole > 0 ? Math.round((part / whole) * 100) : 0)
/** Grouped thousands ("1 400 000") -- the page says once that every sum is in soʻm. */
const sum = (amount: number) => amount.toLocaleString('en-US').replace(/,/g, ' ')
const capitalize = (s: string) => s.charAt(0).toUpperCase() + s.slice(1)
const monthName = (m: BillingMonth) => capitalize(UZ_MONTHS[m.month - 1])

/** What a student still owes for the month. */
const leftOf = (l: AccountingLine) => Math.max(l.amountDue - l.amountPaid, 0)

/** The money each part of the bar stands for -- the same colors everywhere on the page. */
const PART = {
  collected: { label: 'Tushdi', bar: 'bg-brand-500' },
  partial: { label: 'Qisman toʻlovdan qolgan', bar: 'bg-amber-400' },
  unpaid: { label: 'Toʻlanmagan', bar: 'bg-red-500' },
  upcoming: { label: 'Muddati kelmagan', bar: 'bg-slate-300 dark:bg-slate-600' },
} as const

/**
 * Moliya: for one month, how much should come in, how much did, why it's short, and who hasn't
 * paid -- with a payment or a reminder one click away. An admin sees the whole center, a teacher
 * their own groups. Money is counted by the month it pays for.
 */
export function AccountingPage() {
  const current = tashkentMonth()
  const [month, setMonth] = useState<BillingMonth>(current)
  const [groupId, setGroupId] = useState<string | null>(null)

  const accountingQuery = useQuery({
    queryKey: ['accounting', month.year, month.month, 'all'],
    queryFn: () => paymentsApi.accounting(month.year, month.month),
  })
  const data = accountingQuery.data
  const today = data ? data.today : null

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-start justify-between gap-4">
        <div>
          <h1 className="text-xl font-semibold tracking-tight text-slate-900 sm:text-2xl dark:text-slate-100">Moliya</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">
            {today ? `${today.day}-${UZ_MONTHS[today.month - 1]} holatiga · ` : ''}barcha summalar soʻmda
          </p>
        </div>
        <MonthPicker month={month} current={current} onChange={setMonth} />
      </div>

      {accountingQuery.isLoading ? (
        <Spinner />
      ) : accountingQuery.error || !data ? (
        <ErrorBanner message="Maʼlumotlarni yuklab boʻlmadi" />
      ) : data.lines.length === 0 ? (
        <EmptyState title="Bu oy uchun hisob yoʻq" description="Bu oyda guruhlarda oʻquvchi boʻlmagan." />
      ) : (
        <AccountingView data={data} groupId={groupId} onGroup={setGroupId} />
      )}
    </div>
  )
}

/** Back through past months; forward only up to the current one. */
function MonthPicker({ month, current, onChange }: { month: BillingMonth; current: BillingMonth; onChange: (m: BillingMonth) => void }) {
  const isCurrent = monthIndex(month) >= monthIndex(current)
  const arrow =
    'flex h-9 w-9 items-center justify-center rounded-lg text-slate-500 hover:bg-slate-100 disabled:opacity-30 disabled:hover:bg-transparent dark:text-slate-400 dark:hover:bg-slate-800'
  return (
    <div className="flex items-center gap-1 rounded-xl border border-slate-200 bg-white p-1 dark:border-slate-800 dark:bg-slate-900">
      <button type="button" className={arrow} onClick={() => onChange(addMonths(month, -1))} aria-label="Oldingi oy">
        <ChevronLeft className="h-4 w-4" />
      </button>
      <span className="min-w-28 text-center text-sm font-semibold text-slate-800 dark:text-slate-100">
        {formatMonthYear(month.month, month.year)}
      </span>
      <button type="button" className={arrow} onClick={() => onChange(addMonths(month, 1))} disabled={isCurrent} aria-label="Keyingi oy">
        <ChevronRight className="h-4 w-4" />
      </button>
      <button
        type="button"
        onClick={() => onChange(current)}
        disabled={isCurrent}
        className="px-2 text-xs font-semibold text-brand-600 hover:underline disabled:text-slate-400 disabled:no-underline dark:text-brand-400 dark:disabled:text-slate-500"
      >
        Joriy oy
      </button>
    </div>
  )
}

function AccountingView({ data, groupId, onGroup }: { data: Accounting; groupId: string | null; onGroup: (id: string | null) => void }) {
  const group = groupId ? data.groups.find((g) => g.groupId === groupId) ?? null : null
  const summary: AccountingSummary = group ?? data.summary
  const previous = group ? group.previous : data.previous
  const lines = group ? data.lines.filter((l) => l.groupId === groupId) : data.lines
  const scopeLabel = group ? group.groupName ?? 'Guruhsiz' : 'Barcha guruhlar'

  return (
    <>
      <GroupChips data={data} groupId={groupId} onGroup={onGroup} />

      {summary.noFee > 0 && (
        <p className="rounded-lg bg-amber-50 px-4 py-3 text-sm text-amber-800 dark:bg-amber-500/10 dark:text-amber-300">
          {summary.noFee} ta oʻquvchining guruhida oylik narx belgilanmagan — ular hisobga kirmayapti. Guruhni tahrirlab narxni kiriting.
        </p>
      )}

      <Card className="grid gap-8 p-5 sm:p-6 lg:grid-cols-2">
        <Overview
          month={data.month}
          scopeLabel={scopeLabel}
          summary={summary}
          groupCount={group ? 1 : data.groups.length}
          previous={previous}
        />
        <WhyShort summary={summary} groups={group ? [] : data.groups} />
      </Card>

      {!group && data.groups.length > 1 && <GroupTable data={data} onGroup={onGroup} />}

      <WhoOwes lines={lines} month={data.month} today={data.today} scopeLabel={scopeLabel} />
    </>
  )
}

/** "Barcha guruhlar 71%" then every group with its share collected -- picking one filters the page. */
function GroupChips({ data, groupId, onGroup }: { data: Accounting; groupId: string | null; onGroup: (id: string | null) => void }) {
  const chips = [
    { id: null, label: 'Barcha guruhlar', share: percent(data.summary.collected, data.summary.expected) },
    ...[...data.groups]
      .sort((a, b) => (a.groupName ?? '').localeCompare(b.groupName ?? ''))
      .map((g) => ({ id: g.groupId, label: g.groupName ?? 'Guruhsiz', share: percent(g.collected, g.expected) })),
  ]
  return (
    <div className="flex flex-wrap gap-2">
      {chips.map((chip) => {
        const active = chip.id === groupId
        return (
          <button
            key={chip.id ?? 'all'}
            type="button"
            onClick={() => onGroup(chip.id)}
            className={`inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-sm font-semibold transition-colors ${
              active
                ? 'bg-brand-600 text-white shadow-sm'
                : 'bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
            }`}
          >
            {chip.label}
            <span className={`text-xs font-medium tabular-nums ${active ? 'text-brand-100' : 'text-slate-400'}`}>{chip.share}%</span>
          </button>
        )
      })}
    </div>
  )
}

function Overview({
  month,
  scopeLabel,
  summary,
  groupCount,
  previous,
}: {
  month: BillingMonth
  scopeLabel: string
  summary: AccountingSummary
  groupCount: number
  previous: AccountingPrevious
}) {
  const share = percent(summary.collected, summary.expected)
  const notFullyPaid = summary.students - summary.paid - summary.noFee
  const parts = [
    { key: 'collected', amount: Math.min(summary.collected, summary.expected) },
    { key: 'partial', amount: summary.partialAmount },
    { key: 'unpaid', amount: summary.unpaidAmount },
    { key: 'upcoming', amount: summary.upcomingAmount },
  ] as const
  const total = parts.reduce((s, p) => s + p.amount, 0)

  return (
    <div className="flex flex-col gap-5">
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400">
        {formatMonthYear(month.month, month.year)} · {scopeLabel}
      </p>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
        <Figure label="Tushishi kerak" value={summary.expected} hint={`${summary.students} oʻquvchi, ${groupCount} guruh`} />
        <Figure label="Tushdi" value={summary.collected} hint={`${share}% yigʻildi`} tone="brand" />
        <Figure
          label="Yetishmayapti"
          value={summary.missing}
          hint={notFullyPaid > 0 ? `${notFullyPaid} oʻquvchi toʻliq toʻlamagan` : 'Hamma toʻlagan'}
          tone={summary.missing > 0 ? 'red' : 'plain'}
        />
      </div>

      {/* Where the expected money stands: in, half in, not in, not due yet. */}
      <div>
        <div className="flex h-3 gap-0.5 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
          {parts
            .filter((p) => p.amount > 0)
            .map((p) => (
              <div
                key={p.key}
                className={`h-full first:rounded-l-full last:rounded-r-full ${PART[p.key].bar}`}
                style={{ width: `${(p.amount / Math.max(total, 1)) * 100}%` }}
                title={`${PART[p.key].label}: ${sum(p.amount)} soʻm`}
              />
            ))}
        </div>
        <div className="mt-2.5 flex flex-wrap gap-x-4 gap-y-1 text-xs text-slate-600 dark:text-slate-300">
          {parts.map((p) => (
            <span key={p.key} className="flex items-center gap-1.5">
              <span className={`h-2.5 w-2.5 rounded-sm ${PART[p.key].bar}`} />
              {PART[p.key].label}
            </span>
          ))}
        </div>
      </div>

      <Comparison share={share} previous={previous} />
    </div>
  )
}

function Figure({ label, value, hint, tone = 'plain' }: { label: string; value: number; hint: string; tone?: 'plain' | 'brand' | 'red' }) {
  const color = {
    plain: 'text-slate-900 dark:text-slate-100',
    brand: 'text-brand-600 dark:text-brand-300',
    red: 'text-red-600 dark:text-red-400',
  }[tone]
  return (
    <div className="min-w-0">
      <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
      <p className={`mt-0.5 text-2xl font-bold tabular-nums ${color}`}>{sum(value)}</p>
      <p className="mt-0.5 text-xs text-slate-500 dark:text-slate-400">{hint}</p>
    </div>
  )
}

/** "In September 82% was in by this day; now 71% -- 11 points behind." */
function Comparison({ share, previous }: { share: number; previous: AccountingPrevious }) {
  const prevName = monthName(previous)
  const base = previous.sameDayPercent ?? previous.finalPercent
  const diff = share - base
  const behind = diff < 0
  const Icon = behind ? TrendingDown : TrendingUp

  return (
    <div className="flex gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 dark:border-slate-800 dark:bg-slate-800/40">
      <span
        className={`flex h-8 w-8 shrink-0 items-center justify-center rounded-lg ${
          behind ? 'bg-red-100 text-red-600 dark:bg-red-500/15 dark:text-red-400' : 'bg-emerald-100 text-emerald-600 dark:bg-emerald-500/15 dark:text-emerald-400'
        }`}
      >
        <Icon className="h-4 w-4" />
      </span>
      <div className="text-sm">
        <p className="font-semibold text-slate-900 dark:text-slate-100">Oʻtgan oy bilan solishtirish</p>
        <p className="mt-0.5 text-slate-600 dark:text-slate-300">
          {previous.sameDayPercent !== null
            ? `${prevName}da shu kungacha ${base}% yigʻilgan edi. Hozir ${share}%`
            : `${prevName}da ${base}% yigʻilgan. Bu oy ${share}%`}
          {diff === 0 ? ' — bir xil.' : ` — ${Math.abs(diff)} foiz punkt ${behind ? 'past' : 'yuqori'}.`}
        </p>
        {previous.sameDayPercent !== null && (
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            {prevName} yakuni: {previous.finalPercent}% yigʻilgan.
          </p>
        )}
      </div>
    </div>
  )
}

/** "Why is it 4 000 000 short?" -- the gap split by reason, and what to collect right now. */
function WhyShort({ summary, groups }: { summary: AccountingSummary; groups: AccountingGroup[] }) {
  if (summary.missing === 0) {
    return (
      <div className="flex flex-col items-center justify-center gap-2 rounded-xl bg-emerald-50 p-6 text-center dark:bg-emerald-500/10">
        <Check className="h-8 w-8 text-emerald-600 dark:text-emerald-400" />
        <p className="font-semibold text-emerald-800 dark:text-emerald-300">Bu oy hamma toʻliq toʻlagan</p>
      </div>
    )
  }

  const reasons = [
    { key: 'unpaid', title: 'Toʻlamagan, muddati oʻtgan', hint: `${summary.unpaid} oʻquvchi hali hech narsa toʻlamagan`, amount: summary.unpaidAmount },
    { key: 'partial', title: 'Qisman toʻlagan', hint: `${summary.partial} oʻquvchi toʻlovning bir qismini toʻlagan`, amount: summary.partialAmount },
    { key: 'upcoming', title: 'Toʻlov kuni hali kelmagan', hint: `${summary.upcoming} oʻquvchi oy oxirigacha toʻlashi kerak`, amount: summary.upcomingAmount },
  ] as const
  const worst = groups.find((g) => g.missing > 0)

  return (
    <div className="flex flex-col gap-4">
      <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Nima uchun {sum(summary.missing)} soʻm kam?</h2>
      <ul className="flex flex-col gap-3.5">
        {reasons
          .filter((r) => r.amount > 0)
          .map((r) => (
            <li key={r.key} className="flex items-start gap-3">
              <span className={`mt-1.5 h-2.5 w-2.5 shrink-0 rounded-sm ${PART[r.key].bar}`} />
              <div className="min-w-0 grow">
                <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{r.title}</p>
                <p className="text-xs text-slate-500 dark:text-slate-400">{r.hint}</p>
              </div>
              <span className="shrink-0 text-sm font-semibold tabular-nums text-slate-900 dark:text-slate-100">{sum(r.amount)} soʻm</span>
            </li>
          ))}
      </ul>

      {summary.overdue > 0 && (
        <div className="rounded-xl border border-red-200 bg-red-50 p-4 dark:border-red-500/30 dark:bg-red-500/10">
          <p className="text-xs font-medium text-red-700 dark:text-red-300">Hozir undirish kerak (muddati oʻtgan)</p>
          <p className="mt-1 text-2xl font-bold tabular-nums text-red-600 dark:text-red-400">{sum(summary.overdue)} soʻm</p>
          <p className="mt-0.5 text-xs text-red-700/80 dark:text-red-300/80">{summary.overdueStudents} oʻquvchi · roʻyxat pastda</p>
        </div>
      )}

      {worst && groups.length > 1 && (
        <p className="text-sm text-slate-600 dark:text-slate-300">
          Eng katta kamomad: <span className="font-semibold">{worst.groupName ?? 'Guruhsiz'}</span>
          {worst.teacherName ? ` (${worst.teacherName})` : ''} — {sum(worst.missing)} soʻm,{' '}
          {worst.students - worst.paid - worst.noFee} oʻquvchi toʻliq toʻlamagan.
        </p>
      )}
    </div>
  )
}

/** Red below two thirds, the brand color on the way, green once it's all in. */
function shareColor(share: number) {
  if (share >= 100) return 'bg-emerald-500'
  if (share < 65) return 'bg-red-500'
  return 'bg-brand-500'
}

function GroupTable({ data, onGroup }: { data: Accounting; onGroup: (id: string | null) => void }) {
  const total = data.summary
  const th = 'px-3 py-2.5 text-[11px] font-semibold uppercase tracking-wide text-slate-500 dark:text-slate-400'
  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-2 px-5 pt-5">
        <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Guruhlar boʻyicha</h2>
        <p className="text-xs text-slate-500 dark:text-slate-400">Kamomadi eng kattasidan boshlab. Guruhni bossangiz, sahifa shu guruhga filtrlanadi.</p>
      </div>
      <div className="overflow-x-auto">
        <table className="mt-3 w-full min-w-[720px] text-sm">
          <thead>
            <tr className="border-b border-slate-200 text-left dark:border-slate-800">
              <th className={`${th} pl-5`}>Guruh</th>
              <th className={th}>Oʻqituvchi</th>
              <th className={`${th} text-right`}>Oʻquvchi</th>
              <th className={`${th} text-right`}>Kerak</th>
              <th className={`${th} text-right`}>Tushdi</th>
              <th className={`${th} text-right`}>Farq</th>
              <th className={`${th} pr-5`}>Yigʻildi</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
            {data.groups.map((g) => {
              const share = percent(g.collected, g.expected)
              return (
                <tr
                  key={g.groupId ?? 'none'}
                  onClick={() => g.groupId && onGroup(g.groupId)}
                  className="cursor-pointer hover:bg-slate-50 dark:hover:bg-slate-800/50"
                >
                  <td className="py-3 pl-5 pr-3 font-semibold text-slate-900 dark:text-slate-100">{g.groupName ?? 'Guruhsiz'}</td>
                  <td className="px-3 py-3 text-slate-600 dark:text-slate-300">{g.teacherName ?? '—'}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-600 dark:text-slate-300">{g.students}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-900 dark:text-slate-100">{sum(g.expected)}</td>
                  <td className="px-3 py-3 text-right tabular-nums text-slate-900 dark:text-slate-100">{sum(g.collected)}</td>
                  <td className="px-3 py-3 text-right font-semibold tabular-nums">
                    {g.missing > 0 ? (
                      <span className="text-red-600 dark:text-red-400">−{sum(g.missing)}</span>
                    ) : (
                      <span className="text-emerald-600 dark:text-emerald-400">Toʻliq</span>
                    )}
                  </td>
                  <td className="py-3 pl-3 pr-5">
                    <div className="flex items-center gap-2.5">
                      <div className="h-1.5 w-24 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
                        <div className={`h-full rounded-full ${shareColor(share)}`} style={{ width: `${Math.min(share, 100)}%` }} />
                      </div>
                      <span className="w-10 text-right text-xs font-semibold tabular-nums text-slate-700 dark:text-slate-200">{share}%</span>
                    </div>
                  </td>
                </tr>
              )
            })}
            <tr className="bg-slate-50 font-semibold dark:bg-slate-800/40">
              <td className="py-3 pl-5 pr-3 text-slate-900 dark:text-slate-100">Jami</td>
              <td className="px-3 py-3 font-normal text-slate-500 dark:text-slate-400">{data.groups.length} guruh</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-900 dark:text-slate-100">{total.students}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-900 dark:text-slate-100">{sum(total.expected)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-slate-900 dark:text-slate-100">{sum(total.collected)}</td>
              <td className="px-3 py-3 text-right tabular-nums text-red-600 dark:text-red-400">
                {total.missing > 0 ? `−${sum(total.missing)}` : ''}
              </td>
              <td className="py-3 pl-3 pr-5 text-xs tabular-nums text-slate-700 dark:text-slate-200">
                {percent(total.collected, total.expected)}%
              </td>
            </tr>
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

type ListTab = 'overdue' | 'notDue'

/**
 * "Who hasn't paid": the overdue first, most days late on top, each with a reminder and a payment
 * button; the not-yet-due on the other tab; and everyone who paid in full behind a link at the end.
 */
function WhoOwes({
  lines,
  month,
  today,
  scopeLabel,
}: {
  lines: AccountingLine[]
  month: BillingMonth
  today: Accounting['today']
  scopeLabel: string
}) {
  const [tab, setTab] = useState<ListTab>('overdue')
  const [showPaid, setShowPaid] = useState(false)
  const [editing, setEditing] = useState<AccountingLine | null>(null)
  const [remindingAll, setRemindingAll] = useState(false)
  const queryClient = useQueryClient()

  const lateBy = (l: AccountingLine) => daysBetween(calendarDayOf(l.dueDate), today)
  const owing = lines.filter((l) => leftOf(l) > 0)
  const overdue = owing.filter((l) => lateBy(l) >= 0).sort((a, b) => lateBy(b) - lateBy(a) || leftOf(b) - leftOf(a))
  const notDue = owing.filter((l) => lateBy(l) < 0).sort((a, b) => lateBy(b) - lateBy(a))
  const paid = lines.filter((l) => l.state === 'paid')
  const shown = tab === 'overdue' ? overdue : notDue

  const refresh = () => {
    queryClient.invalidateQueries({ queryKey: ['accounting'] })
    queryClient.invalidateQueries({ queryKey: ['group-payments-history'] })
    queryClient.invalidateQueries({ queryKey: ['students'] })
  }

  async function remindAll() {
    if (!window.confirm(`${overdue.length} ta oʻquvchiga Telegram orqali toʻlov eslatmasi yuborilsinmi?`)) return
    setRemindingAll(true)
    let sent = 0
    let notLinked = 0
    for (const line of overdue) {
      try {
        const { notifiedChats } = await paymentsApi.remind(line.studentId)
        if (notifiedChats > 0) sent += 1
        else notLinked += 1
      } catch {
        notLinked += 1
      }
    }
    setRemindingAll(false)
    notifySuccess(`Eslatma yuborildi: ${sent} ta oʻquvchi`)
    if (notLinked > 0) toast.warn(`${notLinked} ta oʻquvchiga yuborilmadi — botga ulanmagan`)
    queryClient.invalidateQueries({ queryKey: ['students'] })
  }

  const tabButton = (key: ListTab, label: string, count: number) => (
    <button
      type="button"
      onClick={() => setTab(key)}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition-colors ${
        tab === key
          ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-700 dark:text-slate-100'
          : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
      }`}
    >
      {label} · {count}
    </button>
  )

  return (
    <Card className="overflow-hidden">
      <div className="flex flex-wrap items-center justify-between gap-3 px-5 pt-5">
        <div>
          <h2 className="text-base font-semibold text-slate-900 dark:text-slate-100">Kim toʻlamagan</h2>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {scopeLabel} · {tab === 'overdue' ? 'eng koʻp kechikkanlar yuqorida' : 'toʻlov kuni yaqinlari yuqorida'}
          </p>
        </div>
        <div className="flex flex-wrap items-center gap-2">
          <div className="flex rounded-lg bg-slate-100 p-1 dark:bg-slate-800">
            {tabButton('overdue', 'Qarzdorlar', overdue.length)}
            {tabButton('notDue', 'Muddati kelmagan', notDue.length)}
          </div>
          {tab === 'overdue' && overdue.length > 0 && (
            <Button size="sm" onClick={remindAll} loading={remindingAll}>
              <Bell className="h-3.5 w-3.5" /> Hammasiga eslatma ({overdue.length})
            </Button>
          )}
        </div>
      </div>

      {shown.length === 0 ? (
        <p className="px-5 py-8 text-center text-sm text-slate-500 dark:text-slate-400">
          {tab === 'overdue' ? 'Muddati oʻtgan qarz yoʻq 🎉' : 'Toʻlov kuni kelmagan oʻquvchi yoʻq'}
        </p>
      ) : (
        <ul className="mt-3 divide-y divide-slate-100 dark:divide-slate-800">
          {shown.map((line) => (
            <OwingRow key={line.studentId} line={line} lateBy={lateBy(line)} onPay={() => setEditing(line)} />
          ))}
        </ul>
      )}

      <div className="flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 px-5 py-3 dark:border-slate-800">
        <span className="flex items-center gap-2 text-sm text-slate-600 dark:text-slate-300">
          <Check className="h-4 w-4 text-emerald-500" />
          {paid.length} nafar oʻquvchi toʻliq toʻlagan
        </span>
        {paid.length > 0 && (
          <button type="button" onClick={() => setShowPaid((s) => !s)} className="text-sm font-semibold text-brand-600 hover:underline dark:text-brand-400">
            {showPaid ? 'Yashirish' : 'Toʻlaganlar roʻyxati'}
          </button>
        )}
      </div>
      {showPaid && (
        <ul className="divide-y divide-slate-100 border-t border-slate-100 dark:divide-slate-800 dark:border-slate-800">
          {paid.map((line) => (
            <li key={line.studentId} className="flex items-center justify-between gap-3 px-5 py-2.5">
              <StudentName line={line} />
              <div className="flex items-center gap-3">
                <span className="text-sm tabular-nums text-slate-600 dark:text-slate-300">{sum(line.amountPaid)} soʻm</span>
                <Button size="sm" variant="ghost" onClick={() => setEditing(line)}>
                  Tahrirlash
                </Button>
              </div>
            </li>
          ))}
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

function StudentName({ line }: { line: AccountingLine }) {
  return (
    <div className="min-w-0">
      <Link
        to={`/students/${line.studentId}`}
        className="block truncate text-sm font-semibold text-slate-900 hover:text-brand-600 dark:text-slate-100 dark:hover:text-brand-400"
      >
        {line.studentName}
      </Link>
      <p className="truncate text-xs text-slate-500 dark:text-slate-400">
        {line.groupName ?? 'Guruhsiz'}
        {line.teacherName ? ` · ${line.teacherName}` : ''}
      </p>
    </div>
  )
}

/** One student who owes: why, since when, how much -- and the two things to do about it. */
function OwingRow({ line, lateBy, onPay }: { line: AccountingLine; lateBy: number; onPay: () => void }) {
  const queryClient = useQueryClient()
  const [reminding, setReminding] = useState(false)
  const partial = line.amountPaid > 0
  const due = formatDayMonth(line.dueDate)
  const when =
    lateBy > 0 ? `${lateBy} kun kechikdi` : lateBy === 0 ? 'bugun toʻlov kuni' : `${-lateBy} kun qoldi`
  const detail = partial ? `${sum(line.amountPaid)} soʻm toʻladi · ${when}` : `${when} · toʻlov kuni ${due}`

  async function remind() {
    setReminding(true)
    try {
      const { notifiedChats } = await paymentsApi.remind(line.studentId)
      if (notifiedChats === 0) toast.warn('Oʻquvchi Telegram botga ulanmagan — eslatma hech kimga bormadi')
      else notifySuccess(`${line.studentName}ga eslatma yuborildi`)
      queryClient.invalidateQueries({ queryKey: ['students'] })
    } catch {
      toast.error('Eslatmani yuborib boʻlmadi')
    } finally {
      setReminding(false)
    }
  }

  return (
    <li className="flex flex-wrap items-center gap-x-4 gap-y-2 px-5 py-3">
      <div className="min-w-0 basis-52 grow sm:grow-0">
        <StudentName line={line} />
      </div>
      <div className="flex min-w-0 grow items-center gap-2.5">
        <span
          className={`shrink-0 rounded-md px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${
            partial
              ? 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20'
              : lateBy >= 0
                ? 'bg-red-50 text-red-700 ring-red-600/20 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-400/20'
                : 'bg-slate-100 text-slate-600 ring-slate-500/20 dark:bg-slate-800 dark:text-slate-300 dark:ring-slate-400/20'
          }`}
        >
          {partial ? 'Qisman' : lateBy >= 0 ? 'Toʻlamagan' : 'Kutilmoqda'}
        </span>
        <span className="truncate text-sm text-slate-600 dark:text-slate-300">{detail}</span>
      </div>
      <div className="ml-auto text-right">
        <p className="text-sm font-bold tabular-nums text-slate-900 dark:text-slate-100">{sum(leftOf(line))} soʻm</p>
        <p className="text-xs tabular-nums text-slate-500 dark:text-slate-400">
          {partial ? 'qoldi · ' : ''}oylik {sum(line.amountDue)}
        </p>
      </div>
      <div className="flex items-center gap-2">
        <Button size="sm" variant="secondary" onClick={remind} loading={reminding}>
          Eslatma
        </Button>
        <Button size="sm" onClick={onPay}>
          Toʻlov kiritish
        </Button>
      </div>
    </li>
  )
}
