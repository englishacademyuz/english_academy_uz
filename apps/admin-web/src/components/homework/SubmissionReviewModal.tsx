import { useEffect, useState, type CSSProperties, type ReactNode } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Check, ChevronLeft, ChevronRight, Loader2, Mic, RotateCcw, RotateCw, X, ZoomIn, ZoomOut } from 'lucide-react'
import { homeworkSubmissions as submissionsApi } from '../../lib/api'
import { formatDate, formatTime } from '../../lib/format'
import { richTextToPlain } from '../../lib/richText'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { HomeworkSubmission, HomeworkSubmissionStatus, SubmissionStudent } from '../../lib/types'
import { VoiceNote } from '../shared/VoiceNote'
import { Badge, Button } from '../ui'

/** A stored homework photo -- fetched with the login cookie, then shown from memory. */
export function HomeworkPhoto({ photoId, className, style }: { photoId: string; className?: string; style?: CSSProperties }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setSrc(null)
    setFailed(false)
    submissionsApi
      .photoUrl(photoId)
      .then((url) => live && setSrc(url))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [photoId])
  if (src) return <img src={src} alt="" className={className} style={style} draggable={false} />
  return (
    <span className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 dark:bg-slate-800 ${className}`}>
      {failed ? 'Rasm yuklanmadi' : <Loader2 className="h-4 w-4 animate-spin" />}
    </span>
  )
}

const STATUS: Record<HomeworkSubmissionStatus, { label: string; tone: 'amber' | 'green' | 'red' }> = {
  SUBMITTED: { label: 'Tekshirilmagan', tone: 'amber' },
  CHECKED: { label: 'Tekshirildi', tone: 'green' },
  RETURNED: { label: 'Qayta ishlashga qaytarildi', tone: 'red' },
}

export function SubmissionStatusBadge({ submission }: { submission: HomeworkSubmission | null }) {
  if (!submission) return <Badge>Topshirmagan</Badge>
  return (
    <span className="inline-flex flex-wrap gap-1">
      <Badge tone={STATUS[submission.status].tone}>{STATUS[submission.status].label}</Badge>
      {submission.late && <Badge tone="red">Kechikkan</Badge>}
    </span>
  )
}

export type ReviewItem = {
  submission: HomeworkSubmission
  student: SubmissionStudent
  lesson: { date: string; topic: string | null; instructions?: string | null }
}

/**
 * Looks through one student's photos (zoom, rotate, ←/→) and voice notes at a time, and records the verdict:
 * checked, or sent back to redo with a comment. Moves on to the next unchecked one after.
 */
export function SubmissionReviewModal({
  items: initialItems,
  startIndex,
  onClose,
  onReviewed,
}: {
  items: ReviewItem[]
  startIndex: number
  onClose: () => void
  onReviewed: (submission: HomeworkSubmission) => void
}) {
  // Its own copy of the list, so a refetch behind it (say, of "unchecked only") doesn't shift it mid-review.
  const [items, setItems] = useState(initialItems)
  const [index, setIndex] = useState(startIndex)
  const [photoIndex, setPhotoIndex] = useState(0)
  const [zoomed, setZoomed] = useState(false)
  const [rotation, setRotation] = useState(0)
  const item = items[index]
  const [comment, setComment] = useState(item?.submission.teacherComment ?? '')

  useEffect(() => {
    setPhotoIndex(0)
    setZoomed(false)
    setRotation(0)
    setComment(items[index]?.submission.teacherComment ?? '')
    // Only when moving to another student -- not when their verdict comes back.
  }, [index])

  useEffect(() => {
    setZoomed(false)
    setRotation(0)
  }, [photoIndex])

  const photos = item?.submission.photos ?? []
  const voices = item?.submission.voices ?? []

  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.target instanceof HTMLTextAreaElement) return
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowRight') setPhotoIndex((i) => Math.min(i + 1, photos.length - 1))
      if (e.key === 'ArrowLeft') setPhotoIndex((i) => Math.max(i - 1, 0))
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [onClose, photos.length])

  const review = useMutation({
    mutationFn: (status: 'CHECKED' | 'RETURNED') => submissionsApi.review(item.submission.id, status, comment),
    onSuccess: (updated, status) => {
      notifySuccess(status === 'CHECKED' ? 'Tekshirildi — oʻquvchiga xabar yuborildi' : 'Qayta ishlashga qaytarildi')
      onReviewed(updated)
      setItems((list) => list.map((it, i) => (i === index ? { ...it, submission: updated } : it)))
      // On to the next one still waiting, if any.
      const next = items.findIndex((it, i) => i > index && it.submission.status === 'SUBMITTED')
      if (next >= 0) setIndex(next)
      else onClose()
    },
    onError: (err) => notifyError(err, 'Saqlab boʻlmadi'),
  })

  if (!item) return null
  const photo = photos[photoIndex]
  const sideways = rotation % 180 !== 0

  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95 md:flex-row">
      {/* Photo pane */}
      <div className="flex min-w-0 grow flex-col">
        <div className="flex items-center justify-between gap-2 px-4 py-3 text-slate-200">
          <span className="text-sm font-medium">{photos.length ? `Rasm ${photoIndex + 1} / ${photos.length}` : 'Rasm yoʻq'}</span>
          <div className="flex items-center gap-1">
            <IconButton label="Chapga burish" onClick={() => setRotation((r) => r - 90)}>
              <RotateCcw className="h-4 w-4" />
            </IconButton>
            <IconButton label="Oʻngga burish" onClick={() => setRotation((r) => r + 90)}>
              <RotateCw className="h-4 w-4" />
            </IconButton>
            <IconButton label={zoomed ? 'Kichraytirish' : 'Kattalashtirish'} onClick={() => setZoomed((z) => !z)}>
              {zoomed ? <ZoomOut className="h-4 w-4" /> : <ZoomIn className="h-4 w-4" />}
            </IconButton>
            <IconButton label="Yopish" onClick={onClose}>
              <X className="h-5 w-5" />
            </IconButton>
          </div>
        </div>

        <div className="relative flex min-h-0 grow items-center justify-center">
          {photoIndex > 0 && (
            <NavArrow side="left" onClick={() => setPhotoIndex(photoIndex - 1)} />
          )}
          <div className={`flex h-full w-full ${zoomed ? 'overflow-auto' : 'items-center justify-center overflow-hidden'} p-4`}>
            {!photo && voices.length > 0 && (
              <span className="flex flex-col items-center gap-2 text-sm text-slate-400">
                <Mic className="h-8 w-8" />
                Faqat ovozli xabar yuborilgan — tinglash uchun oʻng tomonga qarang
              </span>
            )}
            {photo && (
              <button type="button" onClick={() => setZoomed((z) => !z)} className={zoomed ? 'm-auto cursor-zoom-out' : 'cursor-zoom-in'}>
                <HomeworkPhoto
                  photoId={photo.id}
                  className={zoomed ? 'max-w-none' : sideways ? 'max-h-[70vw] max-w-[78vh] object-contain' : 'max-h-[78vh] max-w-full object-contain'}
                  style={{ transform: `rotate(${rotation}deg)`, transition: 'transform 150ms' }}
                />
              </button>
            )}
          </div>
          {photoIndex < photos.length - 1 && (
            <NavArrow side="right" onClick={() => setPhotoIndex(photoIndex + 1)} />
          )}
        </div>

        <div className="flex justify-center gap-2 overflow-x-auto px-4 py-3">
          {photos.map((p, i) => (
            <button
              key={p.id}
              type="button"
              onClick={() => setPhotoIndex(i)}
              className={`h-16 w-12 shrink-0 overflow-hidden rounded-md ring-2 ${i === photoIndex ? 'ring-brand-400' : 'ring-transparent opacity-60 hover:opacity-100'}`}
            >
              <HomeworkPhoto photoId={p.id} className="h-full w-full object-cover" />
            </button>
          ))}
        </div>
      </div>

      {/* Details & verdict */}
      <aside className="flex max-h-[45vh] w-full shrink-0 flex-col gap-4 overflow-y-auto bg-white p-5 md:max-h-none md:w-80 dark:bg-slate-900">
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            disabled={index === 0}
            onClick={() => setIndex(index - 1)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
            aria-label="Oldingi oʻquvchi"
          >
            <ChevronLeft className="h-5 w-5" />
          </button>
          <span className="text-xs text-slate-400">
            {index + 1} / {items.length}
          </span>
          <button
            type="button"
            disabled={index === items.length - 1}
            onClick={() => setIndex(index + 1)}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 disabled:opacity-30 dark:hover:bg-slate-800"
            aria-label="Keyingi oʻquvchi"
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        </div>

        <div>
          <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">
            {item.student.firstName} {item.student.lastName}
          </h2>
          <p className="text-sm text-slate-500 dark:text-slate-400">
            {formatDate(item.lesson.date)}
            {item.lesson.topic ? ` · ${item.lesson.topic}` : ''}
          </p>
        </div>

        {item.lesson.instructions && (
          <div className="rounded-lg bg-slate-50 p-3 text-sm text-slate-600 dark:bg-slate-800/60 dark:text-slate-300">
            <span className="mb-1 block text-[11px] font-semibold uppercase tracking-wide text-slate-400">Vazifa</span>
            <span className="line-clamp-6 whitespace-pre-line">{richTextToPlain(item.lesson.instructions)}</span>
          </div>
        )}

        <div className="space-y-1.5 text-sm">
          <SubmissionStatusBadge submission={item.submission} />
          <p className="text-slate-500 dark:text-slate-400">
            Topshirildi: {formatDate(item.submission.submittedAt)}, {formatTime(item.submission.submittedAt)}
          </p>
        </div>

        {voices.length > 0 && (
          <div className="space-y-2">
            <span className="flex items-center gap-1.5 text-[11px] font-semibold uppercase tracking-wide text-slate-400">
              <Mic className="h-3.5 w-3.5" /> Ovozli xabarlar · {voices.length}
            </span>
            {voices.map((v) => (
              <VoiceNote key={v.id} voiceId={v.id} load={submissionsApi.voiceUrl} duration={v.duration} />
            ))}
          </div>
        )}

        <label className="block">
          <span className="mb-1 block text-sm font-medium text-slate-700 dark:text-slate-300">Izoh (oʻquvchiga boradi)</span>
          <textarea
            value={comment}
            onChange={(e) => setComment(e.target.value)}
            rows={4}
            maxLength={1000}
            placeholder="Masalan: Barakalla! yoki 3-mashqdagi xatolarni tuzating"
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-brand-500 focus:outline-none focus:ring-1 focus:ring-brand-500 dark:border-slate-700 dark:bg-slate-950 dark:text-slate-100"
          />
        </label>

        <div className="mt-auto space-y-2">
          <Button className="w-full justify-center" loading={review.isPending && review.variables === 'CHECKED'} onClick={() => review.mutate('CHECKED')}>
            <Check className="h-4 w-4" /> Tekshirildi
          </Button>
          <Button
            variant="secondary"
            className="w-full justify-center"
            loading={review.isPending && review.variables === 'RETURNED'}
            onClick={() => review.mutate('RETURNED')}
          >
            <RotateCcw className="h-4 w-4" /> Qayta ishlashga qaytarish
          </Button>
          <p className="text-center text-xs text-slate-400">Baho «Oʻquvchilar» boʻlimidagi baholar jadvaliga qoʻyiladi.</p>
        </div>
      </aside>
    </div>
  )
}

function IconButton({ label, onClick, children }: { label: string; onClick: () => void; children: ReactNode }) {
  return (
    <button type="button" onClick={onClick} aria-label={label} title={label} className="rounded-md p-2 hover:bg-white/10">
      {children}
    </button>
  )
}

function NavArrow({ side, onClick }: { side: 'left' | 'right'; onClick: () => void }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-label={side === 'left' ? 'Oldingi rasm' : 'Keyingi rasm'}
      className={`absolute top-1/2 z-10 -translate-y-1/2 rounded-full bg-white/10 p-2 text-white hover:bg-white/20 ${side === 'left' ? 'left-3' : 'right-3'}`}
    >
      {side === 'left' ? <ChevronLeft className="h-6 w-6" /> : <ChevronRight className="h-6 w-6" />}
    </button>
  )
}
