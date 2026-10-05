import { lazy, Suspense, useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { CheckCircle2 } from 'lucide-react'
import { reschedules as reschedulesApi, sessions as sessionsApi } from '../../lib/api'
import { toDateInputValue, toDateTimeInputValue, todayInputValue } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Group } from '../../lib/types'
import { MaterialsEditor, type MaterialDraft } from '../shared/MaterialsEditor'
import { HomeworkImagesEditor, type HomeworkImageDraft } from '../homework/HomeworkImages'
import { isRichTextEmpty } from '../../lib/richText'
import { dateFromKey, nextLessonAfter } from '../../lib/schedule'
import { Button, Card, Field, Input } from '../ui'

// The editor (TipTap) is heavy and only needed here -- load it with the lesson form, not the whole panel.
const RichTextEditor = lazy(() => import('../shared/RichTextEditor').then((m) => ({ default: m.RichTextEditor })))

/** Holds the editor's place while it loads, so the form doesn't jump. */
const EditorPlaceholder = () => (
  <div className="h-[135px] animate-pulse rounded-lg border border-slate-200 bg-slate-50 dark:border-slate-700 dark:bg-slate-800/60" />
)

export function TodayLessonCard({ group, initialDate }: { group: Group; initialDate?: Date }) {
  const queryClient = useQueryClient()
  const [date, setDate] = useState(initialDate ? toDateInputValue(initialDate) : todayInputValue())
  const [topic, setTopic] = useState('')
  const [notes, setNotes] = useState('')
  const [homeworkInstructions, setHomeworkInstructions] = useState('')
  const [homeworkImages, setHomeworkImages] = useState<HomeworkImageDraft[]>([])
  const [uploadingImages, setUploadingImages] = useState(false)
  const [materials, setMaterials] = useState<MaterialDraft[]>([])
  const [savedAt, setSavedAt] = useState<number | null>(null)

  const sessionQuery = useQuery({
    queryKey: ['group-sessions', group.id, date],
    queryFn: () => sessionsApi.listForGroup(group.id, { date }),
  })

  const existingSession = sessionQuery.data?.[0]

  // A picture task is due when the group's next lesson starts, unless the teacher picks another time.
  const lookAhead = useMemo(() => {
    const end = dateFromKey(date)
    end.setDate(end.getDate() + 36)
    return toDateInputValue(end)
  }, [date])
  const reschedulesQuery = useQuery({
    queryKey: ['reschedules', date, lookAhead],
    queryFn: () => reschedulesApi.list(date, lookAhead),
  })
  const nextLesson = nextLessonAfter(group, reschedulesQuery.data ?? [], date)
  const nextLessonStart = nextLesson ? `${nextLesson.day}T${nextLesson.time}` : null

  useEffect(() => {
    if (existingSession) {
      setTopic(existingSession.topic ?? '')
      setNotes(existingSession.notes ?? '')
      setHomeworkInstructions(existingSession.homework?.instructions ?? '')
      setHomeworkImages(
        existingSession.homework?.images.map((i) => ({
          id: i.id,
          title: i.title ?? '',
          caption: i.caption ?? '',
          dueDate: i.dueDate ? toDateTimeInputValue(i.dueDate) : '',
        })) ?? [],
      )
      setMaterials(existingSession.materials.map((m) => ({ type: m.type, content: m.content })))
    } else {
      setTopic('')
      setNotes('')
      setHomeworkInstructions('')
      setHomeworkImages([])
      setMaterials([])
    }
  }, [existingSession])

  const saveMutation = useMutation({
    mutationFn: () =>
      sessionsApi.record(group.id, {
        date,
        // Sent even when cleared, so wiping the topic or explanation actually removes it.
        topic: topic.trim(),
        notes: isRichTextEmpty(notes) ? '' : notes,
        // Always sent, so removing every source actually clears them.
        materials,
        // Pictures alone are homework too; the list is always sent, so removing one removes it.
        homework:
          isRichTextEmpty(homeworkInstructions) && homeworkImages.length === 0
            ? undefined
            : {
                instructions: isRichTextEmpty(homeworkInstructions) ? '' : homeworkInstructions,
                images: homeworkImages.map((i) => ({
                  id: i.id,
                  title: i.title.trim() || null,
                  caption: i.caption.trim() || null,
                  dueDate: i.dueDate ? new Date(i.dueDate).toISOString() : null,
                })),
              },
      }),
    onSuccess: () => {
      notifySuccess('Dars saqlandi')
      setSavedAt(Date.now())
      queryClient.invalidateQueries({ queryKey: ['group-sessions', group.id] })
    },
    onError: (err) => notifyError(err, 'Darsni saqlab boʻlmadi'),
  })

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
          aria-label="Dars sanasi"
          className="w-auto! py-1! text-xs"
        />
      </div>

      <form
        onSubmit={(e) => {
          e.preventDefault()
          saveMutation.mutate()
        }}
        className="space-y-5"
      >
        <Field label="Mavzu">
          <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Present Perfect" />
        </Field>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Tushuntirish</span>
          <Suspense fallback={<EditorPlaceholder />}>
            <RichTextEditor
              value={notes}
              onChange={setNotes}
              placeholder="Darsda nima oʻtildi: qoida, misollar, jadval…"
            />
          </Suspense>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Uy vazifasi</span>
          <Suspense fallback={<EditorPlaceholder />}>
            <RichTextEditor
              value={homeworkInstructions}
              onChange={setHomeworkInstructions}
              placeholder="Ish daftari, 5-bob, 4–7-mashqlar — yoki «Lugʻat» tugmasi bilan soʻzlar jadvali"
            />
          </Suspense>
          <div className="mt-3">
            <HomeworkImagesEditor
              groupId={group.id}
              value={homeworkImages}
              onChange={setHomeworkImages}
              defaultDueDate={nextLessonStart}
              onBusyChange={setUploadingImages}
            />
          </div>
        </div>

        <div>
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Materiallar</span>
          <MaterialsEditor value={materials} onChange={setMaterials} />
        </div>

        <div className="flex items-center justify-between pt-2">
          {savedAt && !saveMutation.isPending && (
            <span className="flex items-center gap-1.5 text-sm text-emerald-600 dark:text-emerald-400">
              <CheckCircle2 className="h-4 w-4" /> Saqlandi
            </span>
          )}
          <Button type="submit" loading={saveMutation.isPending} disabled={uploadingImages} className="ml-auto">
            {uploadingImages ? 'Rasmlar yuklanmoqda…' : 'Darsni saqlash'}
          </Button>
        </div>
      </form>
    </Card>
  )
}
