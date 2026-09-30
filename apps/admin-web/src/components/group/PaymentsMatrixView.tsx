import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { calendarDayOf, daysBetween, paymentDay, tashkentToday, toStoredDate } from '@tashkurgan/shared/billing'
import { payments as paymentsApi } from '../../lib/api'
import { formatDayMonth, paymentCountdownLabel, paymentCountdownTone, paymentStatusLabel, paymentStatusTone } from '../../lib/format'
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
    joinedAt?: string
  } | null>(null)

  const historyQuery = useQuery({
    queryKey: ['group-payments-history', group.id],
    queryFn: () => paymentsApi.historyForGroup(group.id),
  })

  const payments = historyQuery.data?.payments ?? []
  const isCurrentMonth = monthAnchor.year === now.getFullYear() && monthAnchor.month === now.getMonth() + 1

  const today = tashkentToday(now)

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
      // Each student pays on their own day of the month -- the day they joined.
      header: (
        <div className="flex w-full items-center justify-between px-1">
          <ColumnLabel>Holati</ColumnLabel>
          <span className="text-[11px] font-medium text-slate-500 dark:text-slate-400">Toʻlov kuni</span>
        </div>
      ),
      render: (studentId) => {
        const payment =
          payments.find((p) => p.studentId === studentId && p.year === monthAnchor.year && p.month === monthAnchor.month) ??
          null
        const enrollment = roster.find((e) => e.studentId === studentId)
        const studentName = `${enrollment?.student?.firstName ?? ''} ${enrollment?.student?.lastName ?? ''}`.trim()
        const joinedAt = enrollment?.student?.joinedAt
        const due = joinedAt ? paymentDay(joinedAt, monthAnchor) : null
        const dueDays = due ? daysBetween(today, due) : null
        // Nothing is owed for a month before the student joined.
        const joined = joinedAt ? calendarDayOf(joinedAt) : null
        const beforeJoining = !!joined && monthAnchor.year * 12 + monthAnchor.month < joined.year * 12 + joined.month
        const unpaid = payment?.status !== 'PAID'
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
                joinedAt,
              })
            }
            className="flex flex-col items-center gap-0.5 rounded-md transition-opacity hover:opacity-75"
          >
            {beforeJoining && !payment ? (
              <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
            ) : (
              <Badge tone={payment ? paymentStatusTone[payment.status] : dueDays !== null && dueDays > 3 ? 'slate' : 'red'}>
                {payment ? paymentStatusLabel[payment.status] : "Yoʻq"}
              </Badge>
            )}
            {due && !beforeJoining && (
              <span className="flex items-center gap-1 text-[10px] font-medium text-slate-400 dark:text-slate-500">
                {formatDayMonth(toStoredDate(due))}
                {unpaid && dueDays !== null && dueDays <= 3 && (
                  <Badge tone={paymentCountdownTone(dueDays)}>{paymentCountdownLabel(dueDays)}</Badge>
                )}
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
          fee={group.monthlyFee}
          joinedAt={editing.joinedAt}
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
