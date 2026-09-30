import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Pencil, Plus } from 'lucide-react'
import { billingCycles, billingMonthOf, calendarDayOf, tashkentToday, type BillingCycle } from '@tashkurgan/shared/billing'
import { students as studentsApi } from '../../lib/api'
import { formatDate, formatDayMonth, formatMoney, formatMonthYear } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Enrollment, Payment, Student, StudentPaymentReminder } from '../../lib/types'
import { Badge, Button, Card, Input } from '../ui'
import { PaymentModal } from '../shared/PaymentModal'
import { PaymentReminderButton } from '../shared/PaymentReminderButton'

export function PaymentsCard({
  student,
  payments,
  reminder,
  enrollment,
}: {
  student: Student
  payments: Payment[]
  reminder: StudentPaymentReminder | null
  /** The group the student pays for now -- its fee fills the payment form in. */
  enrollment?: Enrollment
}) {
  const [showAdd, setShowAdd] = useState(false)
  // A month to record a payment for -- one the student owes but has no row yet.
  const [adding, setAdding] = useState<{ year: number; month: number } | null>(null)
  const [editing, setEditing] = useState<Payment | null>(null)
  const queryClient = useQueryClient()
  const fee = enrollment?.group?.monthlyFee ?? 0
  const today = tashkentToday()
  // The month that's owed, else the one today falls in.
  const suggested = reminder ?? billingMonthOf(student.joinedAt, today)
  // Every month from the one they joined in to the one they're in now, plus any rows outside that
  // span (recorded ahead, or before a join date was moved).
  const cycles = billingCycles(student.joinedAt, payments, fee, today)
  const extra = payments.filter((p) => !cycles.some((c) => c.year === p.year && c.month === p.month))
  const overdue = cycles.filter((c) => c.state === 'overdue')
  const owed = overdue.reduce((sum, c) => sum + Math.max(c.amountDue - c.amountPaid, 0), 0)
  const current = cycles.find((c) => c.state === 'current')

  function handleSaved() {
    queryClient.invalidateQueries({ queryKey: ['student-overview', student.id] })
    queryClient.invalidateQueries({ queryKey: ['students'] })
    setShowAdd(false)
    setAdding(null)
    setEditing(null)
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between gap-2">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Toʻlovlar</h2>
        <div className="flex items-center gap-2">
          {reminder && <PaymentReminderButton studentId={student.id} reminder={reminder} size="sm" />}
          <Button variant="secondary" onClick={() => setShowAdd(true)}>
            <Plus className="h-4 w-4" /> Toʻlov qoʻshish
          </Button>
        </div>
      </div>

      <JoinedAtRow student={student} />

      <PaymentSummary owed={owed} overdueMonths={overdue.length} current={current} />

      <ul className="divide-y divide-slate-100 dark:divide-slate-800">
        {cycles.map((cycle) => {
          const row = payments.find((p) => p.year === cycle.year && p.month === cycle.month)
          return (
            <CycleRow
              key={`${cycle.year}-${cycle.month}`}
              cycle={cycle}
              note={row?.note}
              onOpen={() => (row ? setEditing(row) : setAdding(cycle))}
            />
          )
        })}
        {extra.map((row) => (
          <CycleRow
            key={row.id}
            cycle={{ ...row, state: row.status === 'PAID' ? 'paid' : 'current', dueDate: '' }}
            note={row.note}
            onOpen={() => setEditing(row)}
          />
        ))}
      </ul>

      {showAdd && (
        <PaymentModal
          studentId={student.id}
          initialYear={suggested.year}
          initialMonth={suggested.month}
          fee={fee}
          joinedAt={student.joinedAt}
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
        />
      )}
      {adding && (
        <PaymentModal
          studentId={student.id}
          initialYear={adding.year}
          initialMonth={adding.month}
          fee={fee}
          joinedAt={student.joinedAt}
          onClose={() => setAdding(null)}
          onSaved={handleSaved}
        />
      )}
      {editing && (
        <PaymentModal
          studentId={student.id}
          initialYear={editing.year}
          initialMonth={editing.month}
          existing={editing}
          fee={fee}
          joinedAt={student.joinedAt}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </Card>
  )
}

/** The headline: what's owed for months whose payment day has come, else the month they're in now. */
function PaymentSummary({
  owed,
  overdueMonths,
  current,
}: {
  owed: number
  overdueMonths: number
  current?: BillingCycle
}) {
  if (overdueMonths > 0) {
    return (
      <div className="mb-4 rounded-lg bg-red-50 p-4 text-center dark:bg-red-500/10">
        <p className="text-2xl font-semibold text-red-700 dark:text-red-400">{formatMoney(owed)}</p>
        <p className="text-xs text-red-600 dark:text-red-400">
          Qarzdorlik · {overdueMonths} oy toʻlanmagan
        </p>
      </div>
    )
  }
  if (current) {
    const left = Math.max(current.amountDue - current.amountPaid, 0)
    return (
      <div className="mb-4 rounded-lg bg-amber-50 p-4 text-center dark:bg-amber-500/10">
        <p className="text-2xl font-semibold text-amber-700 dark:text-amber-400">{formatMoney(left)}</p>
        <p className="text-xs text-amber-700 dark:text-amber-400">
          {formatMonthYear(current.month, current.year)} toʻlanmagan · toʻlov kuni {formatDayMonth(current.dueDate)}
        </p>
      </div>
    )
  }
  return (
    <div className="mb-4 rounded-lg bg-emerald-50 p-4 text-center dark:bg-emerald-500/10">
      <p className="text-2xl font-semibold text-emerald-700 dark:text-emerald-400">{formatMoney(0)}</p>
      <p className="text-xs text-emerald-600 dark:text-emerald-400">Qarzdorlik yoʻq</p>
    </div>
  )
}

const cycleBadge: Record<BillingCycle['state'], { tone: 'green' | 'amber' | 'red'; label: string }> = {
  paid: { tone: 'green', label: 'Toʻlangan' },
  current: { tone: 'amber', label: 'Oʻqiyapti · toʻlanmagan' },
  overdue: { tone: 'red', label: 'Toʻlanmagan' },
}

/** One month: yellow while the student is in it, red once its payment day passes unpaid, green when paid. */
function CycleRow({ cycle, note, onOpen }: { cycle: BillingCycle; note?: string | null; onOpen: () => void }) {
  const partial = cycle.state !== 'paid' && cycle.amountPaid > 0
  const badge = cycleBadge[cycle.state]
  return (
    <li>
      <button
        type="button"
        onClick={onOpen}
        className="flex w-full items-center justify-between gap-3 rounded-md py-3 text-left transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/50"
      >
        <div>
          <p
            className={`text-sm font-medium ${
              cycle.state === 'overdue' ? 'text-red-700 dark:text-red-400' : 'text-slate-900 dark:text-slate-100'
            }`}
          >
            {formatMonthYear(cycle.month, cycle.year)}
          </p>
          <p className="text-xs text-slate-500 dark:text-slate-400">
            {formatMoney(cycle.amountPaid)} / {formatMoney(cycle.amountDue)}
            {cycle.dueDate && ` · toʻlov kuni ${formatDayMonth(cycle.dueDate)}`}
            {note ? ` · ${note}` : ''}
          </p>
        </div>
        <div className="flex shrink-0 items-center gap-2">
          <Badge tone={partial && cycle.state === 'current' ? 'amber' : badge.tone}>
            {partial ? `Qisman · qarz ${formatMoney(cycle.amountDue - cycle.amountPaid)}` : badge.label}
          </Badge>
          <Pencil className="h-4 w-4 text-slate-400" />
        </div>
      </button>
    </li>
  )
}

/** "Qoʻshilgan: 15.09.2026 · toʻlov kuni har oyning 15-sanasi" -- editable, since it moves the payment day. */
function JoinedAtRow({ student }: { student: Student }) {
  const [editing, setEditing] = useState(false)
  const [value, setValue] = useState(student.joinedAt.slice(0, 10))
  const queryClient = useQueryClient()

  const saveMutation = useMutation({
    mutationFn: () => studentsApi.update(student.id, { joinedAt: value }),
    onSuccess: () => {
      notifySuccess('Qoʻshilgan sana yangilandi')
      queryClient.invalidateQueries({ queryKey: ['student-overview', student.id] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      setEditing(false)
    },
    onError: (err) => notifyError(err, 'Sanani yangilab boʻlmadi'),
  })

  if (editing) {
    return (
      <form
        onSubmit={(e) => {
          e.preventDefault()
          saveMutation.mutate()
        }}
        className="mb-3 flex items-center gap-2"
      >
        <Input type="date" value={value} onChange={(e) => setValue(e.target.value)} required className="max-w-44" />
        <Button type="submit" size="sm" loading={saveMutation.isPending}>
          Saqlash
        </Button>
        <Button type="button" size="sm" variant="ghost" onClick={() => setEditing(false)}>
          Bekor qilish
        </Button>
      </form>
    )
  }

  return (
    <div className="mb-3 flex items-center gap-2 text-xs text-slate-500 dark:text-slate-400">
      <CalendarDays className="h-3.5 w-3.5" />
      <span>
        Qoʻshilgan: <span className="font-medium text-slate-700 dark:text-slate-300">{formatDate(student.joinedAt)}</span> ·
        toʻlov kuni har oyning{' '}
        <span className="font-medium text-slate-700 dark:text-slate-300">{calendarDayOf(student.joinedAt).day}-sanasi</span>
      </span>
      <button
        type="button"
        onClick={() => {
          setValue(student.joinedAt.slice(0, 10))
          setEditing(true)
        }}
        className="rounded p-0.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300"
        aria-label="Qoʻshilgan sanani oʻzgartirish"
      >
        <Pencil className="h-3 w-3" />
      </button>
    </div>
  )
}
