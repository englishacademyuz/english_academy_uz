import { useMutation, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { BellRing, Loader2 } from 'lucide-react'
import { attendances as attendancesApi } from '../../lib/api'
import { formatDate, formatDayMonth } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { StudentAbsence } from '../../lib/types'

/**
 * Shown while a student's latest lesson is one they missed. Clicking it tells the student (and
 * parents) in the Telegram bot; it stays, marked as sent, until they come to a later lesson.
 */
export function AbsenceNoticeButton({ studentId, absence }: { studentId: string; absence: StudentAbsence }) {
  const queryClient = useQueryClient()
  const notifyMutation = useMutation({
    mutationFn: () => attendancesApi.notifyAbsence(absence.attendanceId),
    onSuccess: ({ notifiedChats }) => {
      if (notifiedChats === 0) toast.warn('Oʻquvchi Telegram botga ulanmagan — xabar hech kimga bormadi')
      else notifySuccess(`Xabar yuborildi (${notifiedChats} ta chat)`)
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['student-overview', studentId] })
    },
    onError: (err) => notifyError(err, 'Xabarni yuborib boʻlmadi'),
  })

  const sent = !!absence.notifiedAt
  const title = [
    `${absence.groupName} · ${formatDate(absence.date)} darsiga kelmadi`,
    sent ? `Xabar yuborilgan: ${formatDate(absence.notifiedAt!)}` : 'Xabar hali yuborilmagan',
    'Bosing — oʻquvchiga Telegram orqali xabar yuboriladi',
  ].join('\n')

  return (
    <button
      type="button"
      title={title}
      onClick={() => notifyMutation.mutate()}
      disabled={notifyMutation.isPending}
      className={`inline-flex items-center gap-1.5 whitespace-nowrap rounded-full px-2.5 py-1 text-xs font-semibold ring-1 ring-inset transition-colors disabled:opacity-60 ${
        sent
          ? 'bg-red-50 text-red-700 ring-red-300 hover:bg-red-100 dark:bg-red-500/10 dark:text-red-300 dark:ring-red-500/40'
          : 'bg-red-600 text-white ring-red-700 hover:bg-red-700 dark:bg-red-600 dark:ring-red-500'
      }`}
    >
      {notifyMutation.isPending ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <BellRing className="h-3.5 w-3.5" />}
      Kelmadi · {formatDayMonth(absence.date)}
      {sent && <span className="h-1.5 w-1.5 rounded-full bg-current opacity-60" aria-label="Xabar yuborilgan" />}
    </button>
  )
}
