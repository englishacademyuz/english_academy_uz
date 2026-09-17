import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { ApiError, sessions as sessionsApi } from '../../lib/api'
import { attendanceStatusShortLabel, attendanceStatusLabel, materialTypeLabel, todayInputValue } from '../../lib/format'
import type { AttendanceStatus, Group, LessonMaterialType } from '../../lib/types'
import { Button, Card, ErrorBanner, Field, Input, Select } from '../ui'

const ATTENDANCE_OPTIONS: AttendanceStatus[] = ['PRESENT', 'LATE', 'ABSENT', 'EXCUSED']

const MATERIAL_TYPES: LessonMaterialType[] = ['LINK', 'TEXT', 'PDF', 'DOCUMENT', 'IMAGE', 'VIDEO', 'AUDIO']

type MaterialDraft = { type: LessonMaterialType; content: string }

export function TodayLessonCard({ group }: { group: Group }) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(todayInputValue())
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState('')
  const [homeworkInstructions, setHomeworkInstructions] = useState('')
  const [materials, setMaterials] = useState<MaterialDraft[]>([])
  const [materialDraft, setMaterialDraft] = useState<MaterialDraft>({ type: 'LINK', content: '' })
  const [attendance, setAttendance] = useState<Record<string, AttendanceStatus>>({})
  const [error, setError] = useState<string | null>(null)
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const sessionQuery = useQuery({
    queryKey: ['group-sessions', group.id, date],
    queryFn: () => sessionsApi.listForGroup(group.id, date),
  })

  const existingSession = sessionQuery.data?.[0]

  useEffect(() => {
    if (existingSession) {
      setTopic(existingSession.topic ?? '')
      setNotes(existingSession.notes ?? '')
      setHomeworkInstructions(existingSession.homework?.instructions ?? '')
      setMaterials(existingSession.materials.map((m) => ({ type: m.type, content: m.content })))
      const attendanceMap: Record<string, AttendanceStatus> = {}
      for (const a of existingSession.attendances) attendanceMap[a.studentId] = a.status
      setAttendance(attendanceMap)
    } else {
      setTopic('')
      setNotes('')
      setHomeworkInstructions('')
      setMaterials([])
      setAttendance({})
    }
  }, [existingSession])

  const saveMutation = useMutation({
    mutationFn: () =>
      sessionsApi.record(group.id, {
        date,
        topic: topic || undefined,
        notes: notes || undefined,
        materials: materials.length ? materials : undefined,
        homework: homeworkInstructions ? { instructions: homeworkInstructions } : undefined,
        attendance: Object.entries(attendance).map(([studentId, status]) => ({ studentId, status })),
      }),
    onSuccess: () => {
      setSavedAt(Date.now())
      queryClient.invalidateQueries({ queryKey: ['group-sessions', group.id] })
    },
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Darsni saqlab boʻlmadi'),
  })

  function addMaterial() {
    if (!materialDraft.content.trim()) return
    setMaterials((prev) => [...prev, materialDraft])
    setMaterialDraft({ type: 'LINK', content: '' })
  }

  const roster = group.enrollments ?? []

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-slate-900">Bugungi dars</h2>
        <Input
          type="date"
          value={date}
          onChange={(e) => {
            setDate(e.target.value)
            setSavedAt(null)
          }}
          className="w-40"
        />
      </div>

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          saveMutation.mutate()
        }}
        className="space-y-5"
      >
        <div className="grid gap-4 sm:grid-cols-2">
          <Field label="Mavzu">
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Present Perfect" />
          </Field>
          <Field label="Izohlar">
            <Input value={notes} onChange={(e) => setNotes(e.target.value)} placeholder="Ixtiyoriy" />
          </Field>
        </div>

        <Field label="Uy vazifasi">
          <Input
            value={homeworkInstructions}
            onChange={(e) => setHomeworkInstructions(e.target.value)}
            placeholder="Ish daftari, 5-bob, 4–7-mashqlar"
          />
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700">Materiallar</span>
          <div className="mb-2 flex gap-2">
            <Select
              value={materialDraft.type}
              onChange={(e) => setMaterialDraft((d) => ({ ...d, type: e.target.value as LessonMaterialType }))}
              className="w-32"
            >
              {MATERIAL_TYPES.map((type) => (
                <option key={type} value={type}>
                  {materialTypeLabel[type]}
                </option>
              ))}
            </Select>
            <Input
              value={materialDraft.content}
              onChange={(e) => setMaterialDraft((d) => ({ ...d, content: e.target.value }))}
              placeholder="URL, matn yoki fayl havolasi"
            />
            <Button type="button" variant="secondary" onClick={addMaterial}>
              <Plus className="h-4 w-4" />
            </Button>
          </div>
          {materials.length > 0 && (
            <ul className="space-y-1">
              {materials.map((m, i) => (
                <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 px-3 py-1.5 text-sm">
                  <span className="truncate">
                    <span className="mr-2 font-medium text-slate-500">{materialTypeLabel[m.type]}</span>
                    {m.content}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMaterials((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 hover:text-red-600"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div>
          <span className="mb-2 block text-sm font-medium text-slate-700">Davomat</span>
          {roster.length === 0 ? (
            <p className="text-sm text-slate-400">Davomatni belgilash uchun guruhga oʻquvchi yozing.</p>
          ) : (
            <ul className="space-y-1.5">
              {roster.map((enrollment) => (
                <li key={enrollment.id} className="flex items-center justify-between">
                  <span className="text-sm text-slate-700">
                    {enrollment.student?.firstName} {enrollment.student?.lastName}
                  </span>
                  <div className="flex gap-1">
                    {ATTENDANCE_OPTIONS.map((opt) => (
                      <button
                        key={opt}
                        type="button"
                        title={attendanceStatusLabel[opt]}
                        onClick={() =>
                          setAttendance((prev) => ({ ...prev, [enrollment.studentId]: opt }))
                        }
                        className={`h-7 w-7 rounded-md text-xs font-semibold transition-colors ${
                          attendance[enrollment.studentId] === opt
                            ? 'bg-brand-600 text-white'
                            : 'bg-slate-100 text-slate-500 hover:bg-slate-200'
                        }`}
                      >
                        {attendanceStatusShortLabel[opt]}
                      </button>
                    ))}
                  </div>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          {savedAt && !saveMutation.isPending && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600">
              <CheckCircle2 className="h-4 w-4" /> Saqlandi
            </span>
          )}
          <Button type="submit" loading={saveMutation.isPending} className="ml-auto">
            Darsni saqlash
          </Button>
        </div>
      </form>
    </Card>
  )
}
