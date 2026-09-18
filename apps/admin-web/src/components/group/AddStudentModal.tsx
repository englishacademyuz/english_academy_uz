import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { toast } from 'react-toastify'
import { enrollments as enrollmentsApi, students as studentsApi } from '../../lib/api'
import { todayInputValue } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Group } from '../../lib/types'
import { Button, Field, Modal, Select, Spinner } from '../ui'

export function AddStudentModal({ group, onClose }: { group: Group; onClose: () => void }) {
  const [studentId, setStudentId] = useState('')
  const queryClient = useQueryClient()

  const studentsQuery = useQuery({ queryKey: ['students', 'ACTIVE'], queryFn: () => studentsApi.list('ACTIVE') })
  const enrolledStudentIds = new Set((group.enrollments ?? []).map((e) => e.studentId))
  const availableStudents = (studentsQuery.data ?? []).filter((s) => !enrolledStudentIds.has(s.id))

  const enrollMutation = useMutation({
    mutationFn: () => enrollmentsApi.enroll(group.id, studentId, todayInputValue()),
    onSuccess: () => {
      notifySuccess('Oʻquvchi guruhga qoʻshildi')
      queryClient.invalidateQueries({ queryKey: ['group', group.id] })
      onClose()
    },
    onError: (err) => notifyError(err, "Oʻquvchini qoʻshib boʻlmadi"),
  })

  return (
    <Modal title="Oʻquvchi qoʻshish" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (!studentId) return
          // Defensive -- the list below already excludes enrolled students, but guard
          // against a stale selection anyway rather than letting a confusing 500 through.
          if (enrolledStudentIds.has(studentId)) {
            toast.error('Bu oʻquvchi allaqachon guruhda mavjud')
            return
          }
          enrollMutation.mutate()
        }}
        className="space-y-4"
      >
        {studentsQuery.isLoading ? (
          <Spinner />
        ) : availableStudents.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Qoʻshish mumkin boʻlgan oʻquvchi topilmadi — barcha faol oʻquvchilar allaqachon shu guruhda.
          </p>
        ) : (
          <Field label="Oʻquvchi">
            <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
              <option value="">Oʻquvchini tanlang</option>
              {availableStudents.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.firstName} {s.lastName}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={enrollMutation.isPending} disabled={!studentId}>
            Qoʻshish
          </Button>
        </div>
      </form>
    </Modal>
  )
}
