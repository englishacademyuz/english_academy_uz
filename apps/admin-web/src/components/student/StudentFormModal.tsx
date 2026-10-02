import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { students as studentsApi } from '../../lib/api'
import { ageFrom, todayInputValue } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Student } from '../../lib/types'
import { Button, Field, Input, Modal } from '../ui'

/**
 * Creates a student, or edits one with `student`. Only an age is asked for, not a birth date --
 * the server stores it as a birth date that many years back, so the age keeps counting up.
 */
export function StudentFormModal({
  student,
  onClose,
  onSaved,
}: {
  student?: Student
  onClose: () => void
  onSaved: (student: Student) => void
}) {
  const editing = !!student
  const initialAge = student ? ageFrom(student.dob) : null
  const [firstName, setFirstName] = useState(student?.firstName ?? '')
  const [lastName, setLastName] = useState(student?.lastName ?? '')
  const [age, setAge] = useState(initialAge !== null ? String(initialAge) : '')
  const [phone, setPhone] = useState(student?.phone ?? '')
  const [joinedAt, setJoinedAt] = useState(student?.joinedAt.slice(0, 10) ?? todayInputValue())

  const saveMutation = useMutation({
    mutationFn: () => {
      const years = Number(age)
      if (!student) return studentsApi.create({ firstName, lastName, age: years, joinedAt, phone: phone || undefined })
      return studentsApi.update(student.id, {
        firstName,
        lastName,
        phone,
        joinedAt,
        // Re-sent only when changed -- otherwise a real birth date entered earlier would be replaced.
        ...(years !== initialAge ? { age: years } : {}),
      })
    },
    onSuccess: (saved) => {
      notifySuccess(editing ? 'Oʻquvchi maʼlumotlari yangilandi' : 'Oʻquvchi yaratildi')
      onSaved(saved)
    },
    onError: (err) => notifyError(err, editing ? 'Maʼlumotlarni saqlab boʻlmadi' : 'Oʻquvchi yaratib boʻlmadi'),
  })

  return (
    <Modal title={editing ? 'Oʻquvchini tahrirlash' : 'Yangi oʻquvchi'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          saveMutation.mutate()
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Ism">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </Field>
          <Field label="Familiya">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </Field>
        </div>

        <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
          <Field label="Yoshi">
            <Input
              type="number"
              inputMode="numeric"
              min={1}
              max={100}
              value={age}
              onChange={(e) => setAge(e.target.value)}
              placeholder="Masalan: 12"
              required
            />
          </Field>
          <Field label="Telefon (ixtiyoriy)">
            <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
          </Field>
        </div>

        <div>
          <Field label="Guruhga qoʻshilgan sana">
            <Input type="date" value={joinedAt} onChange={(e) => setJoinedAt(e.target.value)} required />
          </Field>
          <p className="mt-1 text-xs text-slate-500 dark:text-slate-400">
            Toʻlov shu kundan hisoblanadi: har oyning {Number(joinedAt.slice(8, 10)) || '…'}-sanasi — toʻlov kuni.
          </p>
        </div>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={saveMutation.isPending}>
            {editing ? 'Saqlash' : 'Oʻquvchi yaratish'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
