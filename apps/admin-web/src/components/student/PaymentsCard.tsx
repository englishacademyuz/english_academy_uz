import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { CalendarDays, Pencil, Plus } from 'lucide-react'
import { billingMonthOf, calendarDayOf, tashkentToday } from '@tashkurgan/shared/billing'
import { students as studentsApi } from '../../lib/api'
import { formatDate, formatMoney, formatMonthYear, paymentStatusLabel, paymentStatusTone } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Enrollment, Payment, Student, StudentPaymentReminder } from '../../lib/types'
import { Badge, Button, Card, EmptyState, Input } from '../ui'
import { PaymentModal } from '../shared/PaymentModal'
import { PaymentReminderButton } from '../shared/PaymentReminderButton'

export function PaymentsCard({
  student,
  payments,
  outstanding,
  reminder,
  enrollment,
}: {
  student: Student
  payments: Payment[]
  outstanding: number
  reminder: StudentPaymentReminder | null
  /** The group the student pays for now -- its fee fills the payment form in. */
  enrollment?: Enrollment
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Payment | null>(null)
  const queryClient = useQueryClient()
  const fee = enrollment?.group?.monthlyFee ?? 0
  // The month that's owed, else the one today falls in.
  const suggested = reminder ?? billingMonthOf(student.joinedAt, tashkentToday())

  function handleSaved() {
    queryClient.invalidateQueries({ queryKey: ['student-overview', student.id] })
    queryClient.invalidateQueries({ queryKey: ['students'] })
    setShowAdd(false)
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

      <div
        className={`mb-4 rounded-lg p-4 text-center ${
          outstanding > 0
            ? 'bg-red-50 dark:bg-red-500/10'
            : 'bg-emerald-50 dark:bg-emerald-500/10'
        }`}
      >
        <p
          className={`text-2xl font-semibold ${
            outstanding > 0 ? 'text-red-700 dark:text-red-400' : 'text-emerald-700 dark:text-emerald-400'
          }`}
        >
          {formatMoney(outstanding)}
        </p>
        <p className={`text-xs ${outstanding > 0 ? 'text-red-600 dark:text-red-400' : 'text-emerald-600 dark:text-emerald-400'}`}>
          {outstanding > 0 ? 'Barcha oylar boʻyicha qarzdorlik' : "Qarzdorlik yoʻq"}
        </p>
      </div>

      {payments.length === 0 ? (
        <EmptyState title="Hali toʻlov qayd etilmagan" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {payments.map((payment) => (
            <li key={payment.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">
                  {formatMonthYear(payment.month, payment.year)}
                </p>
                <p className="text-xs text-slate-500 dark:text-slate-400">
                  {formatMoney(payment.amountPaid)} / {formatMoney(payment.amountDue)}
                  {payment.note ? ` · ${payment.note}` : ''}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <Badge tone={paymentStatusTone[payment.status]}>{paymentStatusLabel[payment.status]}</Badge>
                <Button variant="ghost" onClick={() => setEditing(payment)}>
                  <Pencil className="h-4 w-4" />
                </Button>
              </div>
            </li>
          ))}
        </ul>
      )}

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
