import { useEffect, useRef, useState, type CSSProperties } from 'react'
import { CalendarClock, ChevronLeft, ChevronRight, ImagePlus, Loader2, RotateCw, X } from 'lucide-react'
import { ApiError, homeworkImages as imagesApi } from '../../lib/api'
import { formatDate } from '../../lib/format'
import { shrinkPhoto } from '../../lib/image'
import type { HomeworkImage } from '../../lib/types'
import { Input, Textarea } from '../ui'

/** How many pictures one homework may have -- the server checks the same limit. */
export const MAX_HOMEWORK_IMAGES = 5

/**
 * A picture as the lesson form holds it. Each picture is a task of its own: a title
 * ("Listening", "Vocabulary"), a caption and a deadline (yyyy-mm-dd, '' for none).
 */
export type HomeworkImageDraft = { id: string; title: string; caption: string; dueDate: string }

type Pending = { key: string; blob: Blob; preview: string; failed: boolean }

/** The task's name when the teacher gave it none. */
const taskLabel = (title: string | null | undefined, index: number) => title?.trim() || `${index + 1}-vazifa`

/** A stored homework picture -- fetched with the login cookie, then shown from memory. */
export function HomeworkImageView({ imageId, className, style }: { imageId: string; className?: string; style?: CSSProperties }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    setSrc(null)
    setFailed(false)
    imagesApi
      .url(imageId)
      .then((url) => live && setSrc(url))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [imageId])
  if (src) return <img src={src} alt="" className={className} style={style} draggable={false} />
  return (
    <span className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 dark:bg-slate-800 ${className}`}>
      {failed ? 'Rasm yuklanmadi' : <Loader2 className="h-4 w-4 animate-spin" />}
    </span>
  )
}

/**
 * The homework's pictures in the lesson form, one task each: add several at once (or drop them
 * in), then give each a title, caption and deadline. A new picture's deadline starts at
 * `defaultDueDate` (the group's next lesson). Each picture goes up as soon as it's picked;
 * saving the lesson is what attaches them. `onBusyChange` says whether any are still uploading.
 */
export function HomeworkImagesEditor({
  groupId,
  value,
  onChange,
  defaultDueDate,
  onBusyChange,
}: {
  groupId: string
  value: HomeworkImageDraft[]
  onChange: (images: HomeworkImageDraft[]) => void
  defaultDueDate: string | null
  onBusyChange?: (busy: boolean) => void
}) {
  const [pending, setPending] = useState<Pending[]>([])
  const [error, setError] = useState<string | null>(null)
  const [dragging, setDragging] = useState(false)
  const [viewing, setViewing] = useState<number | null>(null)
  // Pictures waiting to go up, in the order they were picked -- one upload at a time.
  const queue = useRef<Pending[]>([])
  const uploading = useRef(false)
  // The latest list and default, for uploads that finish after the teacher has typed something.
  const latest = useRef(value)
  latest.current = value
  const latestDefault = useRef(defaultDueDate)
  latestDefault.current = defaultDueDate

  const busy = pending.some((p) => !p.failed)
  useEffect(() => onBusyChange?.(busy), [busy, onBusyChange])

  async function drain() {
    if (uploading.current) return
    uploading.current = true
    for (let item = queue.current.shift(); item; item = queue.current.shift()) {
      try {
        const image = await imagesApi.upload(groupId, item.blob)
        latest.current = [...latest.current, { id: image.id, title: '', caption: '', dueDate: latestDefault.current ?? '' }]
        onChange(latest.current)
        URL.revokeObjectURL(item.preview)
        setPending((list) => list.filter((p) => p.key !== item.key))
      } catch (err) {
        setError(
          err instanceof ApiError && err.statusCode === 503
            ? 'Rasm saqlash sozlanmagan (TELEGRAM_STORAGE_CHAT_ID)'
            : err instanceof TypeError
              ? 'Internet aloqasini tekshiring'
              : 'Rasmni yuklab boʻlmadi',
        )
        const failed = item
        setPending((list) => list.map((p) => (p.key === failed.key ? { ...p, failed: true } : p)))
      }
    }
    uploading.current = false
  }

  async function addFiles(files: File[]) {
    const images = files.filter((f) => f.type.startsWith('image/'))
    if (!images.length) return
    setError(null)
    const room = MAX_HOMEWORK_IMAGES - value.length - pending.length
    if (images.length > room) setError(`Koʻpi bilan ${MAX_HOMEWORK_IMAGES} ta rasm`)
    const items = await Promise.all(
      images.slice(0, Math.max(room, 0)).map(async (file, i) => {
        const blob = await shrinkPhoto(file)
        return { key: `${Date.now()}-${i}`, blob, preview: URL.createObjectURL(blob), failed: false }
      }),
    )
    setPending((list) => [...list, ...items])
    queue.current.push(...items)
    drain()
  }

  function retry(item: Pending) {
    setError(null)
    const again = { ...item, failed: false }
    setPending((list) => list.map((p) => (p.key === item.key ? again : p)))
    queue.current.push(again)
    drain()
  }

  function dropPending(item: Pending) {
    URL.revokeObjectURL(item.preview)
    setPending((list) => list.filter((p) => p.key !== item.key))
  }

  const update = (id: string, patch: Partial<HomeworkImageDraft>) =>
    onChange(value.map((v) => (v.id === id ? { ...v, ...patch } : v)))

  const room = MAX_HOMEWORK_IMAGES - value.length - pending.length
  const label = 'mb-1 block text-xs font-medium text-slate-500 dark:text-slate-400'

  return (
    <div className="space-y-3">
      {value.map((image, i) => (
        <div
          key={image.id}
          className="relative flex flex-col gap-3 rounded-lg border border-slate-200 bg-white p-3 sm:flex-row dark:border-slate-700 dark:bg-slate-900"
        >
          <button
            type="button"
            onClick={() => setViewing(i)}
            aria-label="Kattalashtirish"
            className="relative aspect-[4/3] w-full shrink-0 cursor-zoom-in overflow-hidden rounded-md bg-slate-100 sm:w-44 dark:bg-slate-800"
          >
            <HomeworkImageView imageId={image.id} className="h-full w-full object-cover" />
            <span className="absolute left-1.5 top-1.5 rounded bg-slate-900/60 px-1.5 py-0.5 text-[11px] font-medium text-white">
              {i + 1}-vazifa
            </span>
          </button>

          <div className="min-w-0 flex-1 space-y-2.5 sm:pr-8">
            <div>
              <label className={label} htmlFor={`hw-title-${image.id}`}>
                Sarlavha
              </label>
              <Input
                id={`hw-title-${image.id}`}
                value={image.title}
                onChange={(e) => update(image.id, { title: e.target.value })}
                maxLength={100}
                placeholder="Masalan: Listening, Vocabulary (ixtiyoriy)"
              />
            </div>
            <div>
              <label className={label} htmlFor={`hw-caption-${image.id}`}>
                Izoh
              </label>
              <Textarea
                id={`hw-caption-${image.id}`}
                value={image.caption}
                onChange={(e) => update(image.id, { caption: e.target.value })}
                maxLength={500}
                rows={2}
                placeholder="Nima qilish kerak (ixtiyoriy)"
              />
            </div>
            <div>
              <label className={label} htmlFor={`hw-due-${image.id}`}>
                Muddat
              </label>
              <div className="flex flex-wrap items-center gap-2">
                <Input
                  id={`hw-due-${image.id}`}
                  type="date"
                  value={image.dueDate}
                  onChange={(e) => update(image.id, { dueDate: e.target.value })}
                  className="w-auto!"
                />
                {defaultDueDate && image.dueDate !== defaultDueDate && (
                  <button
                    type="button"
                    onClick={() => update(image.id, { dueDate: defaultDueDate })}
                    className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                  >
                    Keyingi dars ({formatDate(defaultDueDate)})
                  </button>
                )}
              </div>
            </div>
          </div>

          <button
            type="button"
            onClick={() => onChange(value.filter((v) => v.id !== image.id))}
            aria-label="Vazifani olib tashlash"
            title="Olib tashlash"
            className="absolute right-2 top-2 flex h-7 w-7 items-center justify-center rounded-full bg-slate-900/60 text-white hover:bg-red-600 sm:bg-transparent sm:text-slate-400 sm:hover:bg-red-50 sm:hover:text-red-600 dark:sm:hover:bg-red-500/10"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      ))}

      {pending.map((item) => (
        <div key={item.key} className="flex items-center gap-3 rounded-lg border border-slate-200 p-3 dark:border-slate-700">
          <div className="relative aspect-[4/3] w-28 shrink-0 overflow-hidden rounded-md">
            <img src={item.preview} alt="" className="h-full w-full object-cover opacity-50" />
            {!item.failed && (
              <span className="absolute inset-0 flex items-center justify-center">
                <Loader2 className="h-6 w-6 animate-spin text-brand-600" />
              </span>
            )}
          </div>
          {item.failed ? (
            <div className="flex items-center gap-2">
              <span className="text-xs text-red-600 dark:text-red-400">Yuklanmadi</span>
              <button
                type="button"
                onClick={() => retry(item)}
                className="inline-flex items-center gap-1 rounded-md bg-brand-600 px-2.5 py-1.5 text-xs font-medium text-white hover:bg-brand-700"
              >
                <RotateCw className="h-3.5 w-3.5" /> Qayta
              </button>
              <button
                type="button"
                onClick={() => dropPending(item)}
                className="rounded-md px-2.5 py-1.5 text-xs font-medium text-slate-500 hover:bg-slate-100 dark:hover:bg-slate-800"
              >
                Bekor qilish
              </button>
            </div>
          ) : (
            <span className="text-xs text-slate-500 dark:text-slate-400">Yuklanmoqda…</span>
          )}
        </div>
      ))}

      {room > 0 && (
        <label
          onDragOver={(e) => {
            e.preventDefault()
            setDragging(true)
          }}
          onDragLeave={() => setDragging(false)}
          onDrop={(e) => {
            e.preventDefault()
            setDragging(false)
            addFiles([...e.dataTransfer.files])
          }}
          className={`flex cursor-pointer items-center justify-center gap-2 rounded-lg border-2 border-dashed px-4 py-4 text-sm font-medium transition-colors ${
            dragging
              ? 'border-brand-500 bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
              : 'border-slate-300 text-slate-500 hover:border-brand-400 hover:bg-slate-50 hover:text-brand-600 dark:border-slate-600 dark:text-slate-400 dark:hover:bg-slate-800/60'
          }`}
        >
          <ImagePlus className="h-5 w-5" />
          Rasmli vazifa qoʻshish
          <span className="text-xs font-normal text-slate-400 dark:text-slate-500">
            ({value.length + pending.length} / {MAX_HOMEWORK_IMAGES})
          </span>
          <input
            type="file"
            accept="image/jpeg,image/png,image/webp"
            multiple
            className="hidden"
            onChange={(e) => {
              addFiles([...(e.target.files ?? [])])
              e.target.value = ''
            }}
          />
        </label>
      )}

      {error && <p className="text-xs text-red-600 dark:text-red-400">{error}</p>}

      {viewing !== null && value[viewing] && (
        <HomeworkImageViewer
          images={value.map((v) => ({ id: v.id, title: v.title, caption: v.caption, dueDate: v.dueDate || null }))}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
        />
      )}
    </div>
  )
}

/** The homework's picture tasks, read-only: picture, title, deadline, caption; a click opens it full-screen. */
export function HomeworkImageGallery({ images }: { images: HomeworkImage[] }) {
  const [viewing, setViewing] = useState<number | null>(null)
  if (images.length === 0) return null
  return (
    <>
      <div className="space-y-2">
        {images.map((image, i) => (
          <button
            key={image.id}
            type="button"
            onClick={() => setViewing(i)}
            className="flex w-full items-start gap-3 rounded-lg bg-white p-2 text-left ring-1 ring-slate-200 hover:ring-brand-400 dark:bg-slate-900 dark:ring-slate-700"
          >
            <HomeworkImageView imageId={image.id} className="aspect-[4/3] w-28 shrink-0 rounded-md object-cover" />
            <span className="min-w-0 space-y-1 py-0.5">
              <span className="block text-sm font-semibold text-slate-900 dark:text-slate-100">{taskLabel(image.title, i)}</span>
              {image.dueDate && <DueLine dueDate={image.dueDate} />}
              {image.caption && <span className="line-clamp-2 block text-xs text-slate-600 dark:text-slate-300">{image.caption}</span>}
            </span>
          </button>
        ))}
      </div>
      {viewing !== null && (
        <HomeworkImageViewer images={images} index={viewing} onIndex={setViewing} onClose={() => setViewing(null)} />
      )}
    </>
  )
}

function DueLine({ dueDate, dark }: { dueDate: string; dark?: boolean }) {
  return (
    <span className={`flex items-center gap-1 text-xs ${dark ? 'text-amber-300' : 'text-amber-700 dark:text-amber-400'}`}>
      <CalendarClock className="h-3.5 w-3.5" /> {formatDate(dueDate)} gacha
    </span>
  )
}

/** Full-screen picture with its title, deadline and caption; ←/→ and Esc work too. */
function HomeworkImageViewer({
  images,
  index,
  onIndex,
  onClose,
}: {
  images: Array<{ id: string; title: string | null; caption: string | null; dueDate: string | null }>
  index: number
  onIndex: (i: number) => void
  onClose: () => void
}) {
  useEffect(() => {
    function onKey(e: KeyboardEvent) {
      if (e.key === 'Escape') onClose()
      if (e.key === 'ArrowLeft' && index > 0) onIndex(index - 1)
      if (e.key === 'ArrowRight' && index < images.length - 1) onIndex(index + 1)
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [index, images.length, onIndex, onClose])

  const image = images[index]
  const arrow = 'absolute top-1/2 flex h-11 w-11 -translate-y-1/2 items-center justify-center rounded-full bg-white/10 text-white hover:bg-white/20'
  return (
    <div className="fixed inset-0 z-50 flex flex-col bg-slate-950/95" onClick={onClose}>
      <div className="flex items-center justify-between gap-3 px-4 py-3 text-slate-200">
        <div className="min-w-0">
          <p className="truncate text-sm font-semibold text-white">{taskLabel(image.title, index)}</p>
          <p className="flex items-center gap-3 text-xs text-slate-400">
            {images.length > 1 && (
              <span>
                {index + 1} / {images.length}
              </span>
            )}
            {image.dueDate && <DueLine dueDate={image.dueDate} dark />}
          </p>
        </div>
        <button type="button" onClick={onClose} aria-label="Yopish" className="rounded-lg p-2 hover:bg-white/10">
          <X className="h-5 w-5" />
        </button>
      </div>
      <div className="relative flex min-h-0 grow items-center justify-center p-4" onClick={(e) => e.stopPropagation()}>
        {index > 0 && (
          <button type="button" onClick={() => onIndex(index - 1)} aria-label="Oldingi" className={`${arrow} left-3`}>
            <ChevronLeft className="h-6 w-6" />
          </button>
        )}
        <HomeworkImageView imageId={image.id} className="max-h-full max-w-full rounded-md object-contain" />
        {index < images.length - 1 && (
          <button type="button" onClick={() => onIndex(index + 1)} aria-label="Keyingi" className={`${arrow} right-3`}>
            <ChevronRight className="h-6 w-6" />
          </button>
        )}
      </div>
      {image.caption?.trim() && (
        <p className="mx-auto mb-5 max-w-2xl whitespace-pre-line px-4 text-center text-sm text-slate-100" onClick={(e) => e.stopPropagation()}>
          {image.caption}
        </p>
      )}
    </div>
  )
}
