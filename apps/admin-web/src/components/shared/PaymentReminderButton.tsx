import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { BellRing, Loader2 } from 'lucide-react'
import { payments as paymentsApi } from '../../lib/api'
import { formatDate, formatMoney } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { StudentPaymentReminder } from '../../lib/types'

const STAGE_LOOK: Record<StudentPaymentReminder['stage'], string> = {
  upcoming:
    'bg-amber-50 text-amber-700 ring-amber-300 hover:bg-amber-100 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-500/40',
  due: 'bg-amber-100 text-amber-800 ring-amber-400 hover:bg-amber-200 dark:bg-amber-500/20 dark:text-amber-200 dark:ring-amber-500/60',
  overdue:
    'bg-red-50 text-red-700 ring-red-300 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/40',
  debtor: 'bg-red-600 text-white ring-red-700 hover:bg-red-700 dark:bg-red-600 dark:ring-red-500',
}

/** What the button says: a countdown, then how late, then "Qarzdor" once the 5 grace days are over. */
export function reminderLabel({ stage, daysLeft }: Pick<StudentPaymentReminder, 'stage' | 'daysLeft'>): string {
  switch (stage) {
    case 'upcoming':
      return `Toʻlovga ${daysLeft} kun`
    case 'due':
      return 'Bugun toʻlov kuni'
    case 'overdue':
      return `${-daysLeft} kun kechikdi`
    case 'debtor':
      return `Qarzdor · ${-daysLeft} kun`
  }
}

/**
 * Shown from three days before a student's payment day until that month is paid: amber while
 * it's coming up or due today, red once it has passed, and "Qarzdor" after five days. Clicking it
 * sends the student (and parents) a reminder in the Telegram bot.
 */
export function PaymentReminderButton({
  studentId,
  reminder,
  size = 'md',
}: {
  studentId: string
  reminder: StudentPaymentReminder
  size?: 'sm' | 'md'
}) {
  const queryClient = useQueryClient()
  const remindMutation = useMutation({
    mutationFn: () => paymentsApi.remind(studentId),
    onSuccess: ({ notifiedChats }) => {
      if (notifiedChats === 0) toast.warn('Oʻquvchi Telegram botga ulanmagan — eslatma hech kimga bormadi')
      else notifySuccess(`Eslatma yuborildi (${notifiedChats} ta chat)`)
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['student-overview', studentId] })
    },
    onError: (err) => notifyError(err, 'Eslatmani yuborib boʻlmadi'),
  })

  const title = [
    `Toʻlov kuni: ${formatDate(reminder.dueDate)}`,
    reminder.amount > 0 ? `Summa: ${formatMoney(reminder.amount)}` : null,
    reminder.unpaidCycles > 1 ? `Toʻlanmagan oylar: ${reminder.unpaidCycles} ta` : null,
    reminder.remindedAt ? `Oxirgi eslatma: ${formatDate(reminder.remindedAt)}` : 'Eslatma hali yuborilmagan',
    'Bosing — oʻquvchiga Telegram orqali eslatma yuboriladi',
  ]
    .filter(Boolean)
    .join('\n')

  return (
    <button
      type="button"
      title={title}
      onClick={() => remindMutation.mutate()}
      disabled={remindMutation.isPending}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full font-semibold ring-1 ring-inset transition-colors disabled:opacity-60 ${
        size === 'sm' ? 'px-2.5 py-1 text-xs' : 'px-3.5 py-2 text-sm'
      } ${STAGE_LOOK[reminder.stage]}`}
    >
      {remindMutation.isPending ? (
        <Loader2 className={`animate-spin ${size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'}`} />
      ) : (
        <BellRing className={size === 'sm' ? 'h-3.5 w-3.5' : 'h-4 w-4'} />
      )}
      {reminderLabel(reminder)}
      {reminder.remindedAt && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" aria-label="Eslatma yuborilgan" />}
    </button>
  )
}
