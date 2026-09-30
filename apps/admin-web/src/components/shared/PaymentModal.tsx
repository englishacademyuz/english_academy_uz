import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { paymentDay, toStoredDate } from '@tashkurgan/shared/billing'
import { payments as paymentsApi } from '../../lib/api'
import {
  dayMonthYearLabel,
  formatMonthYear,
  paymentStatusLabel,
  paymentStatusTone,
} from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Payment, PaymentStatus } from '../../lib/types'
import { Badge, Button, Field, Input, Modal, MoneyInput, Select } from '../ui'

type MonthKey = { year: number; month: number }

const keyOf = ({ year, month }: MonthKey) => `${year}-${month}`
const addMonths = ({ year, month }: MonthKey, by: number): MonthKey => {
  const d = new Date(year, month - 1 + by, 1)
  return { year: d.getFullYear(), month: d.getMonth() + 1 }
}

/** The months offered in the picker: a year back and a couple ahead of the suggested one, newest first. */
const monthChoices = (around: MonthKey) => Array.from({ length: 15 }, (_, i) => addMonths(around, 2 - i))

/** What the status will be once saved -- the same rule the server applies. */
function statusOf(amountDue: number, amountPaid: number): PaymentStatus {
  if (amountPaid >= amountDue) return 'PAID'
  return amountPaid > 0 ? 'PARTIAL' : 'DEBT'
}

/**
 * Shared by the student profile's Payments card and the group roster's
 * Toʻlovlar view. With `existing` it edits that month's row in place;
 * without it, it upserts a new (Student, year, month) row (§51.4) -- the
 * server-side `record` call already overwrites if that month exists.
 *
 * The course price is filled in from the group's fee, but nothing counts as
 * paid until the admin enters the amount the student handed over -- typed, or
 * with the "Toʻliq" / "Yarmi" shortcuts.
 */
export function PaymentModal({
  studentId,
  studentName,
  initialYear,
  initialMonth,
  existing,
  fee = 0,
  joinedAt,
  onClose,
  onSaved,
}: {
  studentId: string
  studentName?: string
  initialYear: number
  initialMonth: number
  existing?: Payment | null
  /** The monthly fee of the group the student pays for -- fills the amounts in; 0 = not set. */
  fee?: number
  /** The day the student joined -- its day of the month is their payment day. */
  joinedAt?: string
  onClose: () => void
  onSaved: () => void
}) {
  const initial = { year: existing?.year ?? initialYear, month: existing?.month ?? initialMonth }
  const [picked, setPicked] = useState<MonthKey>(initial)
  const [amountDue, setAmountDue] = useState(() => existing?.amountDue ?? fee)
  const [amountPaid, setAmountPaid] = useState(() => existing?.amountPaid ?? 0)
  const [dueTouched, setDueTouched] = useState(!!existing)
  const [note, setNote] = useState(existing?.note ?? '')

  function pickMonth(key: string) {
    const [year, month] = key.split('-').map(Number)
    const next = { year, month }
    setPicked(next)
    if (!dueTouched) setAmountDue(fee)
  }

  function changeDue(value: number) {
    setDueTouched(true)
    setAmountDue(value)
  }

  const saveMutation = useMutation({
    mutationFn: () =>
      existing
        ? paymentsApi.update(existing.id, { amountDue, amountPaid, note: note || undefined })
        : paymentsApi.record(studentId, { ...picked, amountDue, amountPaid, note: note || undefined }),
    onSuccess: () => {
      notifySuccess(existing ? 'Toʻlov yangilandi' : 'Toʻlov saqlandi')
      onSaved()
    },
    onError: (err) => notifyError(err, existing ? 'Toʻlovni yangilab boʻlmadi' : 'Toʻlovni saqlab boʻlmadi'),
  })

  const titlePrefix = studentName ? `${studentName} — ` : ''
  const title = existing
    ? `${titlePrefix}${formatMonthYear(existing.month, existing.year)} toʻlovini tahrirlash`
    : `${titlePrefix}Toʻlov qoʻshish`
  const status = statusOf(amountDue, amountPaid)
  const dueDate = joinedAt ? toStoredDate(paymentDay(joinedAt, picked)) : null
  const chip =
    'rounded-md px-2 py-0.5 text-xs font-medium text-brand-700 hover:bg-brand-50 dark:text-brand-300 dark:hover:bg-brand-500/10'

  return (
    <Modal title={title} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          saveMutation.mutate()
        }}
        className="space-y-4"
      >
        {!existing && (
          <Field label="Qaysi oy uchun">
            <Select value={keyOf(picked)} onChange={(e) => pickMonth(e.target.value)}>
              {monthChoices(initial).map((m) => (
                <option key={keyOf(m)} value={keyOf(m)}>
                  {formatMonthYear(m.month, m.year)}
                </option>
              ))}
            </Select>
          </Field>
        )}
        {dueDate && (
          <p className="-mt-2 text-xs text-slate-500 dark:text-slate-400">
            Toʻlov kuni: <span className="font-medium text-slate-700 dark:text-slate-300">{dayMonthYearLabel(dueDate)}</span>
          </p>
        )}

        {!existing && fee === 0 && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            Guruh uchun oylik narx belgilanmagan — guruhni tahrirlab narxni kiriting, keyin summa oʻzi toʻldiriladi.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Kurs narxi">
            <MoneyInput value={amountDue} onChange={changeDue} required />
          </Field>
          <div>
            <Field label="Toʻlangan summa">
              <MoneyInput value={amountPaid} onChange={setAmountPaid} />
            </Field>
            <div className="mt-1 flex gap-1">
              <button type="button" className={chip} onClick={() => setAmountPaid(amountDue)}>
                Toʻliq
              </button>
              <button type="button" className={chip} onClick={() => setAmountPaid(Math.round(amountDue / 2 / 1000) * 1000)}>
                Yarmi
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-2 text-sm dark:bg-slate-800/60">
          <span className="text-slate-500 dark:text-slate-400">Holati</span>
          <Badge tone={paymentStatusTone[status]}>
            {status === 'DEBT' ? 'Toʻlanmagan' : paymentStatusLabel[status]}
            {status === 'PARTIAL' && ` · qarz ${(amountDue - amountPaid).toLocaleString('ru-RU')} soʻm`}
          </Badge>
        </div>

        <Field label="Izoh (ixtiyoriy)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            type="submit"
            loading={saveMutation.isPending}
            disabled={amountDue <= 0 || (!existing && amountPaid <= 0)}
          >
            Saqlash
          </Button>
        </div>
      </form>
    </Modal>
  )
}
