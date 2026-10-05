import { useEffect, useRef, useState } from 'react'
import { ChevronLeft, ChevronRight, ImageIcon, Loader2, X } from 'lucide-react'
import { miniApi } from '../api'
import { weekdayDate } from '../format'
import { haptic } from '../telegram'
import type { MiniHomeworkImage } from '../types'
import { ClockIcon } from './art'

/** The task's name when the teacher gave it none. */
const taskLabel = (image: MiniHomeworkImage, index: number) => image.title?.trim() || `${index + 1}-vazifa`

/** A teacher's homework picture -- fetched with the Telegram auth header, then shown from memory. */
function TeacherImage({ imageId, className }: { imageId: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setSrc(null)
    setFailed(false)
    miniApi
      .homeworkImageUrl(imageId)
      .then((url) => live && setSrc(url))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [imageId])
  if (src) return <img src={src} alt="" className={className} draggable={false} />
  return (
    <span className={`flex items-center justify-center bg-tg-sand text-tg-faint ${className}`}>
      {failed ? <ImageIcon className="h-7 w-7" /> : <Loader2 className="h-7 w-7 animate-spin" />}
    </span>
  )
}

/** A picture keeps its own shape -- within reason, so a long screenshot doesn't fill the screen. */
function aspectOf(image: MiniHomeworkImage) {
  if (!image.width || !image.height) return '4 / 3'
  return String(Math.min(Math.max(image.width / image.height, 3 / 4), 16 / 9))
}

/** "Chor, 8-oktabr gacha", plus how close it is when it's today or tomorrow. */
function DueChip({ dueDate }: { dueDate: string }) {
  const due = new Date(dueDate)
  const today = new Date()
  today.setHours(0, 0, 0, 0)
  const dueDay = new Date(due.getFullYear(), due.getMonth(), due.getDate())
  const days = Math.round((dueDay.getTime() - today.getTime()) / 86_400_000)
  const urgent = days <= 1
  return (
    <span
      className={`flex shrink-0 items-center gap-1 rounded-full px-2.5 py-1 text-[13px] font-extrabold ${
        days < 0 ? 'bg-tg-sand text-tg-muted' : urgent ? 'bg-tg-cherry-soft text-tg-cherry' : 'bg-tg-sun-soft text-tg-sun-ink'
      }`}
    >
      <ClockIcon size={15} strokeWidth={2.6} />
      {days === 0 ? 'Bugun' : days === 1 ? 'Ertaga' : `${weekdayDate(due)} gacha`}
    </span>
  )
}

/**
 * The picture tasks the teacher gave with homework -- each one a homework of its own: a numbered
 * card with its title ("Listening", "Vocabulary"), deadline, the picture and what to do.
 * Tapping a picture opens it full-screen, where the student can swipe through all of them.
 */
export function HomeworkImages({ images }: { images: MiniHomeworkImage[] }) {
  const [viewing, setViewing] = useState<number | null>(null)
  if (images.length === 0) return null

  return (
    <div className="flex w-full flex-col gap-2.5 text-left">
      {images.map((image, i) => (
        <article key={image.id} className="overflow-hidden rounded-[22px] border-2 border-tg-line bg-white">
          <header className="flex items-center gap-2.5 px-3.5 py-3">
            <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tg-grape-2 font-tg-display text-lg font-semibold text-white">
              {i + 1}
            </span>
            <span className="min-w-0 grow truncate font-tg-display text-[19px] font-semibold leading-tight text-tg-ink">
              {taskLabel(image, i)}
            </span>
            {image.dueDate && <DueChip dueDate={image.dueDate} />}
          </header>
          <button
            type="button"
            onClick={() => {
              haptic('tap')
              setViewing(i)
            }}
            className="block w-full bg-tg-sand active:opacity-90"
            style={{ aspectRatio: aspectOf(image) }}
            aria-label="Rasmni kattalashtirish"
          >
            <TeacherImage imageId={image.id} className="h-full w-full object-cover" />
          </button>
          {image.caption && (
            <p className="whitespace-pre-line px-3.5 py-3 text-[15px] font-bold leading-snug text-tg-body">{image.caption}</p>
          )}
        </article>
      ))}

      {viewing !== null && images[viewing] && (
        <ImageViewer images={images} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
      )}
    </div>
  )
}

/** Full-screen, swipe between pictures; the title on top, the caption at the bottom where a thumb won't cover the picture. */
function ImageViewer({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: MiniHomeworkImage[]
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  const touchX = useRef<number | null>(null)
  const image = images[index]
  const go = (i: number) => {
    haptic('tap')
    onIndex(i)
  }

  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (dx < -50 && index < images.length - 1) go(index + 1)
        if (dx > 50 && index > 0) go(index - 1)
      }}
    >
      <div className="flex items-center justify-between gap-3 px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))] text-white">
        <div className="flex min-w-0 flex-col">
          <span className="truncate font-tg-display text-lg font-semibold">{taskLabel(image, index)}</span>
          <span className="text-[13px] font-bold text-white/60">
            {images.length > 1 && `${index + 1} / ${images.length}`}
            {images.length > 1 && image.dueDate && ' · '}
            {image.dueDate && `${weekdayDate(new Date(image.dueDate))} gacha`}
          </span>
        </div>
        <button type="button" onClick={onClose} aria-label="Yopish" className="flex h-11 w-11 shrink-0 items-center justify-center rounded-2xl bg-white/15">
          <X className="h-6 w-6" />
        </button>
      </div>

      <div className="relative flex min-h-0 grow items-center justify-center p-2">
        <TeacherImage imageId={image.id} className="max-h-full max-w-full rounded-xl object-contain" />
        {index > 0 && (
          <button
            type="button"
            onClick={() => go(index - 1)}
            aria-label="Oldingi rasm"
            className="absolute left-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <ChevronLeft className="h-6 w-6" strokeWidth={2.6} />
          </button>
        )}
        {index < images.length - 1 && (
          <button
            type="button"
            onClick={() => go(index + 1)}
            aria-label="Keyingi rasm"
            className="absolute right-2 top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/15 text-white"
          >
            <ChevronRight className="h-6 w-6" strokeWidth={2.6} />
          </button>
        )}
      </div>

      <div className="flex flex-col items-center gap-3 px-4 pb-[max(16px,env(safe-area-inset-bottom))] pt-2">
        {image.caption && (
          <p className="max-h-[30vh] w-full overflow-y-auto whitespace-pre-line rounded-[18px] bg-white px-4 py-3 text-[16px] font-bold leading-snug text-tg-ink">
            {image.caption}
          </p>
        )}
        {images.length > 1 && (
          <div className="flex gap-1.5">
            {images.map((img, i) => (
              <button
                key={img.id}
                type="button"
                onClick={() => go(i)}
                aria-label={`${i + 1}-rasm`}
                className={`h-2.5 rounded-full transition-all ${i === index ? 'w-6 bg-tg-sun' : 'w-2.5 bg-white/40'}`}
              />
            ))}
          </div>
        )}
      </div>
    </div>
  )
}

/** A homework's text for a one-line preview -- or, when it's only pictures, their task titles. */
export function homeworkPreviewText(instructionsPlain: string, images: MiniHomeworkImage[]) {
  if (instructionsPlain.trim()) return instructionsPlain
  const titles = images.map((image) => image.title?.trim()).filter(Boolean)
  if (titles.length) return `📷 ${titles.join(', ')}`
  return images.length === 1 ? '📷 Rasmdagi vazifa' : `📷 ${images.length} ta rasmli vazifa`
}

/** When a homework is due: its own deadline, else the soonest one among its picture tasks. */
export function homeworkDueDate(dueDate: string | null, images: MiniHomeworkImage[]): string | null {
  if (dueDate) return dueDate
  const dates = images.map((image) => image.dueDate).filter((d): d is string => !!d)
  return dates.length ? dates.reduce((a, b) => (a < b ? a : b)) : null
}
