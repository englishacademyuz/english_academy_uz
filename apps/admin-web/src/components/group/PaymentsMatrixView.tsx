import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { payments as paymentsApi } from '../../lib/api'
import {
  daysUntil,
  firstCycleProration,
  formatDate,
  nextPaymentDueDate,
  paymentCountdownLabel,
  paymentCountdownTone,
  paymentStatusLabel,
  paymentStatusTone,
  type FirstCycleProration,
} from '../../lib/format'
import type { Group, Payment } from '../../lib/types'
import { Badge, ColumnLabel, Spinner } from '../ui'
import { DetailMatrix, type MatrixColumn } from './DetailMatrix'
import { MonthNavHeader } from './MonthNavHeader'
import { PaymentModal } from '../shared/PaymentModal'

/** One calendar month of payment status at a time, newest first -- browsed month-by-month via
 * MonthNavHeader the same way JournalView browses lesson days, rather than dumping every month
 * a group has ever had into one wide table. Always starts on the current month. */
export function PaymentsMatrixView({ group }: { group: Group }) {
  const roster = group.enrollments ?? []
  const queryClient = useQueryClient()
  const now = new Date()
  const [monthAnchor, setMonthAnchor] = useState({ year: now.getFullYear(), month: now.getMonth() + 1 })
  const [editing, setEditing] = useState<{
    studentId: string
    studentName: string
    year: number
    month: number
    payment: Payment | null
    proration: FirstCycleProration | null
  } | null>(null)

  const historyQuery = useQuery({
    queryKey: ['group-payments-history', group.id],
    queryFn: () => paymentsApi.historyForGroup(group.id),
  })

  const payments = historyQuery.data?.payments ?? []
  const isCurrentMonth = monthAnchor.year === now.getFullYear() && monthAnchor.month === now.getMonth() + 1

  // Every student in the group is billed on the same monthly day, counted from when the
  // group's own lessons started -- not from whenever each student individually joined.
  const nextDue = nextPaymentDueDate(group.startDate, now)
  const nextDueDays = daysUntil(nextDue, now)

  function goPrev() {
    setMonthAnchor(({ year, month }) => (month === 1 ? { year: year - 1, month: 12 } : { year, month: month - 1 }))
  }
  function goNext() {
    if (isCurrentMonth) return
    setMonthAnchor(({ year, month }) => (month === 12 ? { year: year + 1, month: 1 } : { year, month: month + 1 }))
  }
  function goCurrent() {
    setMonthAnchor({ year: now.getFullYear(), month: now.getMonth() + 1 })
  }

  const columns: MatrixColumn[] = [
    {
      key: 'status',
      grow: true,
      // Every student shares the same due date (billed from the group's own start, not
      // individually), so it's shown once here instead of repeated down every row.
      header: (
        <div className="flex w-full items-center justify-between px-1">
          <ColumnLabel>Holati</ColumnLabel>
          <div className="flex items-center gap-1.5">
            <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">
              Keyingi toʻlov: {formatDate(nextDue)}
            </span>
            <Badge tone={paymentCountdownTone(nextDueDays)}>{paymentCountdownLabel(nextDueDays)}</Badge>
          </div>
        </div>
      ),
      render: (studentId) => {
        const payment =
          payments.find((p) => p.studentId === studentId && p.year === monthAnchor.year && p.month === monthAnchor.month) ??
          null
        const enrollment = roster.find((e) => e.studentId === studentId)
        const studentName = `${enrollment?.student?.firstName ?? ''} ${enrollment?.student?.lastName ?? ''}`.trim()
        const proration = enrollment ? firstCycleProration(group.startDate, enrollment.startDate) : null
        const isPartialMonth = proration?.year === monthAnchor.year && proration?.month === monthAnchor.month
        return (
          <button
            type="button"
            onClick={() =>
              setEditing({
                studentId,
                studentName,
                year: monthAnchor.year,
                month: monthAnchor.month,
                payment,
                proration: isPartialMonth ? proration : null,
              })
            }
            className="flex flex-col items-center gap-0.5 rounded-md transition-opacity hover:opacity-75"
          >
            <Badge tone={payment ? paymentStatusTone[payment.status] : 'red'}>
              {payment ? paymentStatusLabel[payment.status] : "Yoʻq"}
            </Badge>
            {isPartialMonth && (
              <span className="text-[10px] font-medium text-slate-400 dark:text-slate-500">
                {proration!.enrolledDays}/{proration!.cycleDays} kun
              </span>
            )}
          </button>
        )
      },
    },
  ]

  return (
    <div className="flex flex-1 flex-col">
      {historyQuery.isLoading ? (
        <Spinner />
      ) : (
        <DetailMatrix
          roster={roster}
          columns={columns}
          groupHeader={
            <MonthNavHeader
              year={monthAnchor.year}
              month={monthAnchor.month}
              isCurrentMonth={isCurrentMonth}
              onPrev={goPrev}
              onNext={goNext}
              onCurrent={goCurrent}
            />
          }
        />
      )}

      {editing && (
        <PaymentModal
          studentId={editing.studentId}
          studentName={editing.studentName}
          initialYear={editing.year}
          initialMonth={editing.month}
          existing={editing.payment}
          proration={editing.proration}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['group-payments-history', group.id] })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
