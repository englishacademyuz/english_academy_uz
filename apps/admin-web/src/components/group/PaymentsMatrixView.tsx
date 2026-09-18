import { useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { payments as paymentsApi } from '../../lib/api'
import { formatMonthYear, paymentStatusLabel, paymentStatusTone } from '../../lib/format'
import type { Group, Payment } from '../../lib/types'
import { Badge, Card, Spinner } from '../ui'
import { StudentsMatrixTable, type MatrixColumn } from './StudentsMatrixTable'
import { PaymentModal } from '../shared/PaymentModal'

/** Columns are every month that has ever had a payment recorded, plus the current month even if nothing's been recorded for it yet -- so there's always somewhere to click to record it. */
export function PaymentsMatrixView({ group }: { group: Group }) {
  const roster = group.enrollments ?? []
  const queryClient = useQueryClient()
  const [editing, setEditing] = useState<{
    studentId: string
    studentName: string
    year: number
    month: number
    payment: Payment | null
  } | null>(null)

  const historyQuery = useQuery({
    queryKey: ['group-payments-history', group.id],
    queryFn: () => paymentsApi.historyForGroup(group.id),
  })

  const payments = historyQuery.data?.payments ?? []
  const now = new Date()
  const monthKeys = new Set(payments.map((p) => `${p.year}-${String(p.month).padStart(2, '0')}`))
  monthKeys.add(`${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}`)
  const sortedMonths = [...monthKeys].sort().map((key) => {
    const [year, month] = key.split('-').map(Number)
    return { key, year, month }
  })

  const columns: MatrixColumn[] = sortedMonths.map(({ key, year, month }) => ({
    key,
    header: formatMonthYear(month, year),
    render: (studentId) => {
      const payment = payments.find((p) => p.studentId === studentId && p.year === year && p.month === month) ?? null
      const enrollment = roster.find((e) => e.studentId === studentId)
      const studentName = `${enrollment?.student?.firstName ?? ''} ${enrollment?.student?.lastName ?? ''}`.trim()
      return (
        <button
          type="button"
          onClick={() => setEditing({ studentId, studentName, year, month, payment })}
          className="rounded-md transition-opacity hover:opacity-75"
        >
          <Badge tone={payment ? paymentStatusTone[payment.status] : 'red'}>
            {payment ? paymentStatusLabel[payment.status] : "Yoʻq"}
          </Badge>
        </button>
      )
    },
  }))

  return (
    <Card className="p-5">
      <h2 className="mb-4 text-sm font-semibold text-slate-900 dark:text-slate-100">Toʻlovlar</h2>

      {historyQuery.isLoading ? <Spinner /> : <StudentsMatrixTable roster={roster} columns={columns} />}

      {editing && (
        <PaymentModal
          studentId={editing.studentId}
          studentName={editing.studentName}
          initialYear={editing.year}
          initialMonth={editing.month}
          existing={editing.payment}
          onClose={() => setEditing(null)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['group-payments-history', group.id] })
            setEditing(null)
          }}
        />
      )}
    </Card>
  )
}
