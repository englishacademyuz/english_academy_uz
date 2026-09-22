import { useEffect, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2, Plus, Trash2 } from 'lucide-react'
import { sessions as sessionsApi } from '../../lib/api'
import { materialTypeLabel, toDateInputValue, todayInputValue } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Group, LessonMaterialType } from '../../lib/types'
import { Button, Card, Field, Input, Select } from '../ui'

const MATERIAL_TYPES: LessonMaterialType[] = ['LINK', 'TEXT', 'PDF', 'DOCUMENT', 'IMAGE', 'VIDEO', 'AUDIO']

type MaterialDraft = { type: LessonMaterialType; content: string }

export function TodayLessonCard({ group, initialDate }: { group: Group; initialDate?: Date }) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(initialDate ? toDateInputValue(initialDate) : todayInputValue())
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState('')
  const [homeworkInstructions, setHomeworkInstructions] = useState('')
  const [materials, setMaterials] = useState<MaterialDraft[]>([])
  const [materialDraft, setMaterialDraft] = useState<MaterialDraft>({ type: 'LINK', content: '' })
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const sessionQuery = useQuery({
    queryKey: ['group-sessions', group.id, date],
    queryFn: () => sessionsApi.listForGroup(group.id, { date }),
  })

  const existingSession = sessionQuery.data?.[0]

  useEffect(() => {
    if (existingSession) {
      setTopic(existingSession.topic ?? '')
      setNotes(existingSession.notes ?? '')
      setHomeworkInstructions(existingSession.homework?.instructions ?? '')
      setMaterials(existingSession.materials.map((m) => ({ type: m.type, content: m.content })))
    } else {
      setTopic('')
      setNotes('')
      setHomeworkInstructions('')
      setMaterials([])
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
      }),
    onSuccess: () => {
      notifySuccess('Dars saqlandi')
      setSavedAt(Date.now())
      queryClient.invalidateQueries({ queryKey: ['group-sessions', group.id] })
    },
    onError: (err) => notifyError(err, 'Darsni saqlab boʻlmadi'),
  })

  function addMaterial() {
    if (!materialDraft.content.trim()) return
    setMaterials((prev) => [...prev, materialDraft])
    setMaterialDraft({ type: 'LINK', content: '' })
  }

  return (
    <Card className="p-5">
      <div className="mb-4 flex items-center justify-between gap-4">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">
          {date === todayInputValue() ? 'Bugungi dars' : 'Dars'}
        </h2>
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

      <form
        onSubmit={(e) => {
          e.preventDefault()
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
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Materiallar</span>
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
                <li key={i} className="flex items-center justify-between rounded-lg bg-slate-50 dark:bg-slate-800/60 px-3 py-1.5 text-sm">
                  <span className="truncate">
                    <span className="mr-2 font-medium text-slate-500 dark:text-slate-400">{materialTypeLabel[m.type]}</span>
                    {m.content}
                  </span>
                  <button
                    type="button"
                    onClick={() => setMaterials((prev) => prev.filter((_, idx) => idx !== i))}
                    className="text-slate-400 dark:text-slate-500 hover:text-red-600 dark:hover:text-red-400"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>

        <div className="flex items-center justify-between pt-2">
          {savedAt && !saveMutation.isPending && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
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
