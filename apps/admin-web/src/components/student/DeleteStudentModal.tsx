import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, UserMinus } from 'lucide-react'
import { students as studentsApi } from '../../lib/api'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Student } from '../../lib/types'
import { Button, Field, Input, Modal } from '../ui'

/** Deleting wipes the student's whole history, so it asks for their name first and points to "Ketgan" as the gentler option. */
export function DeleteStudentModal({
  student,
  onClose,
  onDeleted,
}: {
  student: Student
  onClose: () => void
  onDeleted: () => void
}) {
  const queryClient = useQueryClient()
  const [confirmText, setConfirmText] = useState('')
  const fullName = `${student.firstName} ${student.lastName}`

  const deleteMutation = useMutation({
    mutationFn: () => studentsApi.remove(student.id),
    onSuccess: () => {
      notifySuccess('Oʻquvchi oʻchirildi')
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['group'] })
      queryClient.removeQueries({ queryKey: ['student-overview', student.id] })
      onDeleted()
    },
    onError: (err) => notifyError(err, 'Oʻquvchini oʻchirib boʻlmadi'),
  })

  return (
    <Modal title="Oʻquvchini oʻchirish" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <b>{fullName}</b> va uning barcha maʼlumotlari butunlay oʻchiriladi: guruhlari, davomati, baholari, test
            natijalari, toʻlovlari va ballari. Buni qaytarib boʻlmaydi.
          </p>
        </div>

        <p className="flex gap-2 text-sm text-slate-600 dark:text-slate-300">
          <UserMinus className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
          Oʻquvchi shunchaki oʻqishni tashlagan boʻlsa, uning holatini «Ketgan» qilib qoʻying — tarixi saqlanib qoladi.
        </p>

        <Field label={`Tasdiqlash uchun oʻquvchi ismini yozing: ${fullName}`}>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            variant="destructive"
            loading={deleteMutation.isPending}
            disabled={confirmText.trim() !== fullName}
            onClick={() => deleteMutation.mutate()}
          >
            Oʻchirish
          </Button>
        </div>
      </div>
    </Modal>
  )
}
