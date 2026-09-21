import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { payments as paymentsApi } from '../../lib/api'
import { formatMonthYear, type FirstCycleProration } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Payment } from '../../lib/types'
import { Button, Field, Input, Modal } from '../ui'

// Placeholder "full month" fee the amount fields default to -- there's no stored per-group
// tariff (§51.4 keeps Payment.amountDue a free-entry Money value), so a partial first cycle's
// suggested amount is this default scaled by the proration ratio, not a real configured price.
const DEFAULT_MONTHLY_FEE = 500_000

/**
 * Shared by the student profile's Payments card and the group roster's
 * Toʻlovlar view. With `existing` it edits that month's row in place;
 * without it, it upserts a new (Student, year, month) row (§51.4) -- the
 * server-side `record` call already overwrites if that month exists.
 */
export function PaymentModal({
  studentId,
  studentName,
  initialYear,
  initialMonth,
  existing,
  proration,
  onClose,
  onSaved,
}: {
  studentId: string
  studentName?: string
  initialYear: number
  initialMonth: number
  existing?: Payment | null
  /** Set when this row is the student's first billing cycle and they joined the group mid-cycle
   * -- e.g. a group starting 5 September with a student joining the 15th owes only 20 of that
   * cycle's 30 days. Ignored once `existing` is set, since an already-recorded amount was a
   * deliberate choice, not something to silently overwrite. */
  proration?: FirstCycleProration | null
  onClose: () => void
  onSaved: () => void
}) {
  const applyProration = !existing && !!proration
  const [year, setYear] = useState(existing?.year ?? initialYear)
  const [month, setMonth] = useState(existing?.month ?? initialMonth)
  const [amountDue, setAmountDue] = useState(() => {
    if (existing) return existing.amountDue
    if (proration) return Math.round((DEFAULT_MONTHLY_FEE * proration.ratio) / 1000) * 1000
    return DEFAULT_MONTHLY_FEE
  })
  const [amountPaid, setAmountPaid] = useState(existing?.amountPaid ?? 0)
  const [note, setNote] = useState(existing?.note ?? '')

  const saveMutation = useMutation({
    mutationFn: () =>
      existing
        ? paymentsApi.update(existing.id, { amountDue, amountPaid, note: note || undefined })
        : paymentsApi.record(studentId, { year, month, amountDue, amountPaid, note: note || undefined }),
    onSuccess: () => {
      notifySuccess(existing ? "Toʻlov yangilandi" : "Toʻlov saqlandi")
      onSaved()
    },
    onError: (err) => notifyError(err, existing ? "Toʻlovni yangilab boʻlmadi" : "Toʻlovni saqlab boʻlmadi"),
  })

  const titlePrefix = studentName ? `${studentName} — ` : ''
  const title = existing
    ? `${titlePrefix}${formatMonthYear(existing.month, existing.year)} toʻlovini tahrirlash`
    : `${titlePrefix}Toʻlov qoʻshish`

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
          <div className="grid grid-cols-2 gap-4">
            <Field label="Oy (1–12)">
              <Input type="number" min={1} max={12} value={month} onChange={(e) => setMonth(Number(e.target.value))} required />
            </Field>
            <Field label="Yil">
              <Input type="number" value={year} onChange={(e) => setYear(Number(e.target.value))} required />
            </Field>
          </div>
        )}

        {applyProration && (
          <p className="rounded-lg bg-amber-50 px-3 py-2 text-xs text-amber-700 dark:bg-amber-500/10 dark:text-amber-400">
            Oʻquvchi ushbu oyning bir qismida qoʻshilgan — {proration.cycleDays} kunlik oydan{' '}
            {proration.enrolledDays} kuni hisoblanadi. Belgilangan summa shunga mos taklif qilindi, xohlasangiz
            oʻzgartiring.
          </p>
        )}

        <div className="grid grid-cols-2 gap-4">
          <Field label="Belgilangan summa">
            <Input type="number" min={0} value={amountDue} onChange={(e) => setAmountDue(Number(e.target.value))} required />
          </Field>
          <Field label="Toʻlangan summa">
            <Input type="number" min={0} value={amountPaid} onChange={(e) => setAmountPaid(Number(e.target.value))} />
          </Field>
        </div>

        <Field label="Izoh (ixtiyoriy)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        {!existing && (
          <p className="text-xs text-slate-400 dark:text-slate-500">
            Ushbu oy uchun toʻlov allaqachon mavjud boʻlsa, u yangi qiymatlar bilan almashtiriladi.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={saveMutation.isPending}>
            Saqlash
          </Button>
        </div>
      </form>
    </Modal>
  )
}
