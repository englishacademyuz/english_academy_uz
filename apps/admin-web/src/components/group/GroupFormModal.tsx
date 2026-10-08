import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { AlertTriangle, Archive, Send } from 'lucide-react'
import {
  groups as groupsApi,
  levels as levelsApi,
  subjects as subjectsApi,
  teachers as teachersApi,
  type GroupInput,
} from '../../lib/api'
import { dayLabel, toDateInputValue } from '../../lib/format'
import { levelStyles } from '../../lib/levelColor'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Group } from '../../lib/types'
import { Button, Field, Input, Modal, MoneyInput, Select } from '../ui'

export const WEEKDAYS = ['MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT', 'SUN']

/** Create a group, or (given `group`) fix the details of one created with a mistake. */
export function GroupFormModal({
  group,
  onClose,
  onSaved,
}: {
  group?: Group
  onClose: () => void
  onSaved: (group: Group) => void
}) {
  const editing = !!group
  const [subjectId, setSubjectId] = useState('')
  const [levelId, setLevelId] = useState(group?.levelId ?? '')
  const [teacherId, setTeacherId] = useState(group?.teacherId ?? '')
  const [name, setName] = useState(group?.name ?? '')
  const [scheduleDays, setScheduleDays] = useState<string[]>(group?.scheduleDays ?? [])
  const [scheduleTime, setScheduleTime] = useState(group?.scheduleTime ?? '18:00')
  const [startDate, setStartDate] = useState(group ? toDateInputValue(group.startDate) : '')
  const [monthlyFee, setMonthlyFee] = useState(group?.monthlyFee ?? 0)
  const [homeworkSubmissionEnabled, setHomeworkSubmissionEnabled] = useState(group?.homeworkSubmissionEnabled ?? false)

  const subjectsQuery = useQuery({ queryKey: ['subjects'], queryFn: subjectsApi.list })
  const levelsQuery = useQuery({ queryKey: ['levels'], queryFn: () => levelsApi.list() })
  const teachersQuery = useQuery({ queryKey: ['teachers'], queryFn: teachersApi.list })

  const levelsForSubject = (levelsQuery.data ?? []).filter((level) => {
    const course = subjectsQuery.data?.flatMap((s) => s.courses ?? []).find((c) => c.id === level.courseId)
    return !subjectId || course?.subjectId === subjectId
  })
  const selectedLevel = levelsQuery.data?.find((l) => l.id === levelId)

  const saveMutation = useMutation({
    mutationFn: () => {
      const data: GroupInput = {
        levelId,
        teacherId,
        name,
        scheduleDays,
        scheduleTime,
        startDate,
        monthlyFee,
        homeworkSubmissionEnabled,
      }
      return editing ? groupsApi.update(group.id, data) : groupsApi.create(data)
    },
    onSuccess: (saved) => {
      notifySuccess(editing ? 'Guruh maʼlumotlari yangilandi' : 'Guruh yaratildi')
      onSaved(saved)
    },
    onError: (err) => notifyError(err, editing ? 'Guruhni saqlab boʻlmadi' : 'Guruh yaratib boʻlmadi'),
  })

  function toggleDay(day: string) {
    setScheduleDays((prev) =>
      prev.includes(day) ? prev.filter((d) => d !== day) : WEEKDAYS.filter((d) => d === day || prev.includes(d)),
    )
  }

  const accent = levelStyles(selectedLevel?.color)

  return (
    <Modal title={editing ? 'Guruhni tahrirlash' : 'Yangi guruh'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          saveMutation.mutate()
        }}
        className="space-y-4"
      >
        <Field label="Nomi">
          <Input value={name} onChange={(e) => setName(e.target.value)} required placeholder="Oʻrta daraja 02" />
        </Field>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Fan">
            <Select value={subjectId} onChange={(e) => setSubjectId(e.target.value)}>
              <option value="">Barcha fanlar</option>
              {subjectsQuery.data?.map((s) => (
                <option key={s.id} value={s.id}>
                  {s.name}
                </option>
              ))}
            </Select>
          </Field>

          <Field label="Daraja">
            <div className="relative">
              <span
                className="pointer-events-none absolute left-3 top-1/2 h-2.5 w-2.5 -translate-y-1/2 rounded-full"
                style={selectedLevel ? accent.fill : undefined}
              />
              <Select value={levelId} onChange={(e) => setLevelId(e.target.value)} required className="pl-7">
                <option value="">Tanlang</option>
                {levelsForSubject.map((l) => (
                  <option key={l.id} value={l.id}>
                    {l.name}
                  </option>
                ))}
              </Select>
            </div>
          </Field>
        </div>

        <Field label="Oʻqituvchi">
          <Select value={teacherId} onChange={(e) => setTeacherId(e.target.value)} required>
            <option value="">Oʻqituvchini tanlang</option>
            {teachersQuery.data?.map((t) => (
              <option key={t.id} value={t.id}>
                {t.fullName}
              </option>
            ))}
          </Select>
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Dars kunlari</span>
          <div className="grid grid-cols-7 gap-1.5">
            {WEEKDAYS.map((day) => {
              const active = scheduleDays.includes(day)
              return (
                <button
                  type="button"
                  key={day}
                  onClick={() => toggleDay(day)}
                  aria-pressed={active}
                  style={active ? (selectedLevel ? accent.solid : undefined) : undefined}
                  className={`h-9 rounded-lg text-xs font-bold transition-colors ${
                    active
                      ? 'bg-brand-600 text-white shadow-sm'
                      : 'bg-slate-100 text-slate-500 hover:bg-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:hover:bg-slate-700'
                  }`}
                >
                  {dayLabel[day]}
                </button>
              )
            })}
          </div>
        </div>

        <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
          <Field label="Vaqt">
            <Input type="time" value={scheduleTime} onChange={(e) => setScheduleTime(e.target.value)} required />
          </Field>
          <Field label="Darslar boshlanish sanasi">
            <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
          </Field>
        </div>

        <div>
          <Field label="Oylik kurs narxi">
            <MoneyInput value={monthlyFee} onChange={setMonthlyFee} placeholder="Masalan: 500 000" />
          </Field>
          <p className="mt-1 text-xs text-slate-400 dark:text-slate-500">
            {startDate
              ? `Toʻlov har oyning ${Number(startDate.slice(8, 10))}-sanasida — darslar boshlangan kuni. `
              : 'Toʻlov har oy darslar boshlangan kunda boʻladi. '}
            Toʻlov oynasi shu narx bilan toʻldiriladi.
          </p>
        </div>

        <label className="flex cursor-pointer items-start gap-3 rounded-lg border border-slate-200 p-3 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60">
          <input
            type="checkbox"
            checked={homeworkSubmissionEnabled}
            onChange={(e) => setHomeworkSubmissionEnabled(e.target.checked)}
            className="mt-0.5 h-4 w-4 rounded border-slate-300 text-brand-600 focus:ring-brand-500"
          />
          <span className="min-w-0">
            <span className="flex items-center gap-1.5 text-sm font-medium text-slate-800 dark:text-slate-200">
              <Send className="h-4 w-4 text-slate-400" /> Uyga vazifani platforma orqali topshirish
            </span>
            <span className="mt-0.5 block text-xs text-slate-500 dark:text-slate-400">
              Oʻquvchilar vazifani Telegram orqali yuboradi: daftar rasmi yoki ovozli xabar (speaking uchun). Oʻqituvchi ularni «Uyga vazifalar» boʻlimida tekshiradi.
            </span>
          </span>
        </label>

        {editing && (
          <p className="rounded-lg bg-slate-50 px-3 py-2 text-xs text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
            Oʻtgan darslar, davomat va baholar oʻzgarmaydi — yangi jadval keyingi darslardan boshlab amal qiladi.
          </p>
        )}

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={saveMutation.isPending} disabled={scheduleDays.length === 0}>
            {editing ? 'Saqlash' : 'Guruh yaratish'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}

/** Confirms "deleting" (archiving) a group, spelling out what's kept and what's cleared. */
export function DeleteGroupModal({ group, onClose, onDeleted }: { group: Group; onClose: () => void; onDeleted: () => void }) {
  const queryClient = useQueryClient()
  const [confirmText, setConfirmText] = useState('')
  const studentCount = group.enrollments?.length ?? 0

  const deleteMutation = useMutation({
    mutationFn: () => groupsApi.remove(group.id),
    onSuccess: () => {
      notifySuccess('Guruh oʻchirildi')
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['reschedules'] })
      onDeleted()
    },
    onError: (err) => notifyError(err, 'Guruhni oʻchirib boʻlmadi'),
  })

  return (
    <Modal title="Guruhni oʻchirish" onClose={onClose}>
      <div className="space-y-4">
        <div className="flex gap-3 rounded-lg bg-red-50 p-3 text-sm text-red-800 dark:bg-red-500/10 dark:text-red-300">
          <AlertTriangle className="mt-0.5 h-5 w-5 shrink-0" />
          <p>
            <b>{group.name}</b> guruhi roʻyxat va dars jadvalidan olib tashlanadi.
          </p>
        </div>

        <ul className="space-y-2 text-sm text-slate-600 dark:text-slate-300">
          <li className="flex gap-2">
            <span className="text-red-500">✕</span>
            Kelgusi darslar va koʻchirishlar jadvaldan oʻchiriladi
          </li>
          <li className="flex gap-2">
            <span className="text-red-500">✕</span>
            {studentCount > 0
              ? `${studentCount} ta oʻquvchi guruhdan chiqariladi (boshqa guruhga qoʻshish mumkin boʻladi)`
              : 'Guruhda faol oʻquvchi yoʻq'}
          </li>
          <li className="flex gap-2">
            <Archive className="mt-0.5 h-4 w-4 shrink-0 text-emerald-600" />
            Oʻtgan darslar, manbalar, davomat, baholar va ballar tarix sifatida saqlanadi
          </li>
        </ul>

        <Field label={`Tasdiqlash uchun guruh nomini yozing: ${group.name}`}>
          <Input value={confirmText} onChange={(e) => setConfirmText(e.target.value)} autoFocus />
        </Field>

        <div className="flex justify-end gap-2 pt-1">
          <Button variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button
            variant="destructive"
            loading={deleteMutation.isPending}
            disabled={confirmText.trim() !== group.name.trim()}
            onClick={() => deleteMutation.mutate()}
          >
            Guruhni oʻchirish
          </Button>
        </div>
      </div>
    </Modal>
  )
}
