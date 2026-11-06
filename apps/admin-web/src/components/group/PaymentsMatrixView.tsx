import { useState } from 'react'
import { Link } from 'react-router-dom'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { calendarDayOf, daysBetween, paymentDay, tashkentToday, toStoredDate } from '@tashkurgan/shared/billing'
import { payments as paymentsApi } from '../../lib/api'
import { formatDayMonth, formatMoney, paymentCountdownLabel, paymentCountdownTone, paymentStatusLabel, paymentStatusTone } from '../../lib/format'
import type { Group, Payment } from '../../lib/types'
import { Badge, ColumnLabel, Spinner } from '../ui'
import { DetailMatrix, type MatrixColumn } from './DetailMatrix'
import { MonthNavHeader } from './MonthNavHeader'
import { PaymentModal } from '../shared/PaymentModal'

/** The month's money for this group in one line: collected of expected, and what's still missing. */
function GroupMonthSummary({ groupId, year, month }: { groupId: string; year: number; month: number }) {
  const query = useQuery({
    queryKey: ['accounting', year, month, groupId],
    queryFn: () => paymentsApi.accounting(year, month, groupId),
  })
  const s = query.data?.summary
  if (!s || s.students === 0) return null
  const share = s.expected > 0 ? Math.round((s.collected / s.expected) * 100) : 0

  return (
    <div className="flex flex-wrap items-center gap-x-5 gap-y-1.5 border-b border-slate-200 px-4 py-2.5 text-xs dark:border-slate-800">
      <span className="text-slate-500 dark:text-slate-400">
        Tushdi{' '}
        <span className="font-semibold tabular-nums text-slate-900 dark:text-slate-100">{formatMoney(s.collected)}</span>
        {' / '}
        <span className="tabular-nums">{formatMoney(s.expected)}</span> ({share}%)
      </span>
      {s.missing > 0 && (
        <span className="text-slate-500 dark:text-slate-400">
          Yetishmayapti <span className="font-semibold tabular-nums text-red-600 dark:text-red-400">{formatMoney(s.missing)}</span>
        </span>
      )}
      <span className="text-slate-500 dark:text-slate-400">
        {s.paid} toʻlagan · {s.partial} qisman · {s.unpaid} toʻlamagan{s.upcoming > 0 && ` · ${s.upcoming} kutilmoqda`}
      </span>
      <Link to="/accounting" className="ml-auto font-semibold text-brand-600 hover:underline dark:text-brand-400">
        Moliya →
      </Link>
    </div>
  )
}

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
      <GroupMonthSummary groupId={group.id} year={monthAnchor.year} month={monthAnchor.month} />
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
            queryClient.invalidateQueries({ queryKey: ['accounting'] })
            setEditing(null)
          }}
        />
      )}
    </div>
  )
}
