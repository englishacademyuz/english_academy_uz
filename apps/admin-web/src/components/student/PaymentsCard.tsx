import { useState } from 'react'
import { useQueryClient } from '@tanstack/react-query'
import { Pencil, Plus } from 'lucide-react'
import { formatMoney, formatMonthYear, paymentStatusLabel, paymentStatusTone } from '../../lib/format'
import type { Payment } from '../../lib/types'
import { Badge, Button, Card, EmptyState } from '../ui'
import { PaymentModal } from '../shared/PaymentModal'

export function PaymentsCard({
  studentId,
  payments,
  outstanding,
}: {
  studentId: string
  payments: Payment[]
  outstanding: number
}) {
  const [showAdd, setShowAdd] = useState(false)
  const [editing, setEditing] = useState<Payment | null>(null)
  const queryClient = useQueryClient()
  const now = new Date()

  function handleSaved() {
    queryClient.invalidateQueries({ queryKey: ['student-overview', studentId] })
    setShowAdd(false)
    setEditing(null)
  }

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Toʻlovlar</h2>
        <Button variant="secondary" onClick={() => setShowAdd(true)}>
          <Plus className="h-4 w-4" /> Toʻlov qoʻshish
        </Button>
      </div>

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
          studentId={studentId}
          initialYear={now.getFullYear()}
          initialMonth={now.getMonth() + 1}
          onClose={() => setShowAdd(false)}
          onSaved={handleSaved}
        />
      )}
      {editing && (
        <PaymentModal
          studentId={studentId}
          initialYear={editing.year}
          initialMonth={editing.month}
          existing={editing}
          onClose={() => setEditing(null)}
          onSaved={handleSaved}
        />
      )}
    </Card>
  )
}
