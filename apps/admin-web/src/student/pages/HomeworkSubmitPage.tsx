import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Camera, ImagePlus, Loader2, Mic, RotateCw, Trash2, X } from 'lucide-react'
import { HomeworkVideo } from '../../components/shared/HomeworkVideo'
import { RichText } from '../../components/shared/RichText'
import { VoiceNote } from '../../components/shared/VoiceNote'
import { shrinkPhoto } from '../../lib/image'
import { isRichTextEmpty } from '../../lib/richText'
import { MiniApiError, miniApi } from '../api'
import { CheckIcon, ClockIcon, LateSticker } from '../components/art'
import { useNow } from '../deadline'
import { HomeworkImages } from '../components/HomeworkImages'
import { ErrorState, Loading, Screen, Section } from '../components/kit'
import { formatDateTime, weekdayDate, weekdayDayMonth } from '../format'
import { haptic, webApp } from '../telegram'
import type { MiniHomeworkDetail, MiniSubmission } from '../types'

type Pending = { key: string; blob: Blob; preview: string; failed: boolean }

const UPLOAD_ERRORS: Record<string, string> = {
  TOO_MANY_PHOTOS: 'Rasmlar soni chegaraga yetdi',
  ALREADY_CHECKED: 'Ustoz bu vazifani allaqachon tekshirgan',
  SUBMISSIONS_DISABLED: 'Bu guruhda vazifa platforma orqali topshirilmaydi',
  DEADLINE_PASSED: 'Topshirish muddati tugagan',
}

/**
 * Topshirish: the homework, the student's photos, voice notes and videos for it, and the camera/gallery
 * buttons to add photos. Voice notes and videos are recorded in the bot chat (Telegram's own buttons).
 * Once the deadline has passed, nothing more can be added or taken out -- unless the teacher sent
 * it back to be redone.
 */
export function HomeworkSubmitPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const queryKey = ['mini', 'homework', id]
  const homework = useQuery({ queryKey, queryFn: () => miniApi.homeworkDetail(id!), enabled: !!id })
  const [pending, setPending] = useState<Pending[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  // Photos waiting to go up, in the order they were picked -- one upload at a time.
  const queue = useRef<Pending[]>([])
  const uploading = useRef(false)
  const back = { to: '/student/homework', label: 'Vazifalar' }
  const now = useNow()

  function setSubmission(submission: MiniSubmission | null) {
    queryClient.setQueryData<MiniHomeworkDetail>(queryKey, (old) => old && { ...old, submission })
    queryClient.invalidateQueries({ queryKey: ['mini', 'homework'], exact: true })
    queryClient.invalidateQueries({ queryKey: ['mini', 'lesson', id] })
  }

  // A failed photo stays on screen with a retry button; the rest keep going.
  async function drain() {
    if (uploading.current) return
    uploading.current = true
    let failures = 0
    for (let item = queue.current.shift(); item; item = queue.current.shift()) {
      try {
        setSubmission(await miniApi.uploadHomeworkPhoto(id!, item.blob))
        URL.revokeObjectURL(item.preview)
        setPending((list) => list.filter((p) => p.key !== item.key))
      } catch (err) {
        const code = err instanceof MiniApiError ? err.message : ''
        // The page was open as the deadline passed -- show it closed.
        if (code === 'DEADLINE_PASSED') homework.refetch()
        setError(UPLOAD_ERRORS[code] ?? (err instanceof TypeError ? 'Internet aloqasini tekshiring' : 'Rasmni yuborib boʻlmadi'))
        const failed = item
        setPending((list) => list.map((p) => (p.key === failed.key ? { ...p, failed: true } : p)))
        failures += 1
      }
    }
    uploading.current = false
    haptic(failures ? 'error' : 'success')
  }

  async function addFiles(files: FileList | null, room: number) {
    if (!files?.length) return
    setError(null)
    const picked = [...files].slice(0, room)
    if (files.length > room) setError(`Yana faqat ${room} ta rasm qoʻshish mumkin`)
    const items = await Promise.all(
      picked.map(async (file, i) => {
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

  async function remove(photoId: string) {
    try {
      const { submission } = await miniApi.deleteHomeworkPhoto(photoId)
      setSubmission(submission)
      setViewing(null)
    } catch {
      setError('Rasmni oʻchirib boʻlmadi')
    }
  }

  async function removeVoice(voiceId: string) {
    try {
      const { submission } = await miniApi.deleteHomeworkVoice(voiceId)
      setSubmission(submission)
    } catch {
      setError('Ovozli xabarni oʻchirib boʻlmadi')
    }
  }

  async function removeVideo(videoId: string) {
    try {
      const { submission } = await miniApi.deleteHomeworkVideo(videoId)
      setSubmission(submission)
    } catch {
      setError('Videoni oʻchirib boʻlmadi')
    }
  }

  if (homework.isLoading) return <Loading />
  if (homework.error || !homework.data) {
    return (
      <Screen back={back} title="Uyga vazifa">
        <ErrorState error={homework.error} onRetry={() => homework.refetch()} />
      </Screen>
    )
  }

  const { date, topic, group, instructions, dueDate, images, closesAt, submissionEnabled, submission, maxPhotos, maxVoices, maxVideos, botTarget } =
    homework.data
  const photos = submission?.photos ?? []
  const voices = submission?.voices ?? []
  const videos = submission?.videos ?? []
  // A submission sent back to be redone stays open past the deadline.
  const late = !!closesAt && now.getTime() >= new Date(closesAt).getTime() && submission?.status !== 'RETURNED'
  const open = submissionEnabled && submission?.status !== 'CHECKED' && !late
  const room = maxPhotos - photos.length - pending.length
  const canAdd = open && room > 0

  return (
    <Screen back={back} eyebrow={weekdayDayMonth(new Date(date))} title={topic || 'Uyga vazifa'} subtitle={group}>
      <section className="flex flex-col gap-3 rounded-[26px] border-[3px] border-tg-sun bg-tg-sun-soft p-4">
        <div className="flex flex-wrap items-center justify-between gap-2">
          <span className="text-sm font-extrabold text-tg-sun-ink">USTOZ YOZDI</span>
          {dueDate && (
            <span className="flex items-center gap-1.5 rounded-full bg-white px-3 py-1.5 text-[14px] font-extrabold">
              <ClockIcon size={18} strokeWidth={2.4} className="text-tg-rust" />
              {weekdayDate(new Date(dueDate))} gacha
            </span>
          )}
        </div>
        {!isRichTextEmpty(instructions) && (
          <div className="rounded-[18px] bg-white px-4 py-3">
            <RichText value={instructions} variant="tg" />
          </div>
        )}
        <HomeworkImages images={images} />
      </section>

      {!submissionEnabled ? (
        <div className="flex items-center justify-center gap-2 rounded-[18px] border-[3px] border-tg-leaf bg-tg-leaf-soft px-3 py-3.5 text-base font-extrabold text-tg-leaf-dark">
          <CheckIcon size={22} />
          Ustoz darsda tekshiradi
        </div>
      ) : (
        <>
          <StatusBanner submission={submission} />
          {late && submission?.status !== 'CHECKED' && <DeadlinePassed closesAt={new Date(closesAt!)} handedIn={!!submission} />}

          <Section title={`Rasmlarim${photos.length ? ` · ${photos.length}` : ''}`}>
            {photos.length === 0 && pending.length === 0 ? (
              <p className="rounded-[22px] border-2 border-dashed border-tg-dash bg-white px-4 py-6 text-center text-[15px] font-bold text-tg-muted">
                Vazifani bajarib, daftaringizni suratga oling. Rasmlar darhol ustozga boradi.
              </p>
            ) : (
              <div className="grid grid-cols-3 gap-2">
                {photos.map((photo, i) => (
                  <button
                    key={photo.id}
                    type="button"
                    onClick={() => setViewing(i)}
                    className="aspect-[3/4] overflow-hidden rounded-[18px] border-2 border-tg-line bg-tg-sand active:scale-[0.98]"
                  >
                    <PhotoImage photoId={photo.id} className="h-full w-full object-cover" />
                  </button>
                ))}
                {pending.map((item) => (
                  <div key={item.key} className="relative aspect-[3/4] overflow-hidden rounded-[18px] border-2 border-tg-line">
                    <img src={item.preview} alt="" className="h-full w-full object-cover opacity-60" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      {item.failed ? (
                        <button
                          type="button"
                          onClick={() => retry(item)}
                          aria-label="Qayta yuborish"
                          className="flex h-12 w-12 items-center justify-center rounded-full bg-tg-cherry text-white"
                        >
                          <RotateCw className="h-6 w-6" strokeWidth={2.5} />
                        </button>
                      ) : (
                        <Loader2 className="h-9 w-9 animate-spin text-tg-blue" />
                      )}
                    </span>
                  </div>
                ))}
              </div>
            )}
          </Section>

          {error && <p className="rounded-[18px] bg-tg-cherry-soft px-4 py-3 text-center text-[15px] font-extrabold text-tg-cherry">{error}</p>}

          {canAdd && (
            <div className="grid grid-cols-2 gap-2.5">
              <PickButton icon={<Camera className="h-7 w-7" strokeWidth={2.4} />} label="Suratga olish" tone="blue" capture onPick={(f) => addFiles(f, room)} />
              <PickButton icon={<ImagePlus className="h-7 w-7" strokeWidth={2.4} />} label="Galereyadan" tone="white" multiple onPick={(f) => addFiles(f, room)} />
            </div>
          )}
          {open && (
            <p className="text-center text-[13px] font-bold text-tg-faint">
              Koʻpi bilan {maxPhotos} ta rasm.{botTarget && ' Rasmni botga yuborsangiz ham shu vazifaga qoʻshiladi.'}
            </p>
          )}

          {(voices.length > 0 || open) && (
            <Section title={`Ovozli xabarlarim${voices.length ? ` · ${voices.length}` : ''}`}>
              {voices.length > 0 && (
                <div className="flex flex-col gap-2">
                  {voices.map((voice) => (
                    <div key={voice.id} className="flex items-center gap-2 rounded-[18px] border-2 border-tg-line bg-white px-3 py-2">
                      <VoiceNote
                        voiceId={voice.id}
                        load={miniApi.homeworkVoiceUrl}
                        duration={voice.duration}
                        className="grow"
                        labelClassName="text-tg-muted font-bold"
                      />
                      {open && (
                        <button
                          type="button"
                          onClick={() => removeVoice(voice.id)}
                          aria-label="Ovozli xabarni oʻchirish"
                          className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-tg-cherry active:bg-tg-cherry-soft"
                        >
                          <Trash2 className="h-5 w-5" strokeWidth={2.4} />
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {open && <VoiceHint botTarget={botTarget} full={voices.length >= maxVoices} />}
            </Section>
          )}

          {(videos.length > 0 || open) && (
            <Section title={`Videolarim${videos.length ? ` · ${videos.length}` : ''}`}>
              {videos.length > 0 && (
                <div className="flex flex-col gap-2">
                  {videos.map((video) => (
                    <div key={video.id} className="flex flex-col items-center gap-2 rounded-[18px] border-2 border-tg-line bg-white p-2">
                      <HomeworkVideo
                        videoId={video.id}
                        load={miniApi.homeworkVideoUrl}
                        duration={video.duration}
                        round={video.round}
                        labelClassName="text-tg-muted font-bold"
                      />
                      {open && (
                        <button
                          type="button"
                          onClick={() => removeVideo(video.id)}
                          className="flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-extrabold text-tg-cherry active:bg-tg-cherry-soft"
                        >
                          <Trash2 className="h-4 w-4" strokeWidth={2.4} /> Oʻchirish
                        </button>
                      )}
                    </div>
                  ))}
                </div>
              )}
              {open && (
                <p className="mt-2 text-center text-[13px] font-bold text-tg-faint">
                  {videos.length >= maxVideos
                    ? 'Videolar soni chegaraga yetdi.'
                    : `Gapirayotganingizni videoga olib (yoki dumaloq video xabar) botga yuboring 🎬 Koʻpi bilan ${maxVideos} ta, har biri 20 MB gacha.`}
                </p>
              )}
            </Section>
          )}
        </>
      )}

      {viewing !== null && photos[viewing] && (
        <PhotoViewer
          photos={photos}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          onDelete={open ? remove : undefined}
        />
      )}
    </Screen>
  )
}

/** Too late: the deadline has passed, so the buttons are gone -- said with a sad sticker. */
function DeadlinePassed({ closesAt, handedIn }: { closesAt: Date; handedIn: boolean }) {
  return (
    <section className="flex flex-col items-center gap-2 rounded-[26px] border-[3px] border-tg-cherry bg-tg-cherry-soft px-4 py-5 text-center">
      <LateSticker size={112} />
      <span className="font-tg-display text-xl font-semibold leading-tight text-tg-cherry">Muddat oʻtib ketdi</span>
      <span className="text-[14px] font-bold text-tg-muted">Muddat: {formatDateTime(closesAt.toISOString())} gacha edi</span>
      <p className="text-[15px] font-bold text-tg-body">
        {handedIn
          ? 'Topshirganlaringiz ustozga yetib bordi. Endi yangi narsa qoʻshib yoki oʻchirib boʻlmaydi.'
          : 'Afsuski, bu vazifa endi qabul qilinmaydi. Keyingisini oʻz vaqtida topshiring 💪'}
      </p>
    </section>
  )
}

function StatusBanner({ submission }: { submission: MiniSubmission | null }) {
  if (!submission) return null
  const look = {
    SUBMITTED: { box: 'border-tg-leaf bg-tg-leaf-soft', title: 'text-tg-leaf-dark', icon: '✅', text: 'Topshirildi — ustoz tekshiradi' },
    RETURNED: { box: 'border-tg-cherry bg-tg-cherry-soft', title: 'text-tg-cherry', icon: '🔁', text: 'Qayta ishlash kerak' },
    CHECKED: { box: 'border-tg-blue bg-tg-blue-soft', title: 'text-tg-blue-dark', icon: '⭐', text: 'Ustoz tekshirdi' },
  }[submission.status]
  return (
    <section className={`flex flex-col gap-2 rounded-[22px] border-[3px] px-4 py-3.5 ${look.box}`}>
      <div className="flex items-center gap-2.5">
        <span className="text-2xl" aria-hidden>
          {look.icon}
        </span>
        <div className="flex min-w-0 flex-col">
          <span className={`font-tg-display text-lg font-semibold leading-tight ${look.title}`}>{look.text}</span>
          <span className="text-[13px] font-bold text-tg-muted">
            {formatDateTime(submission.status === 'SUBMITTED' ? submission.submittedAt : (submission.checkedAt ?? submission.submittedAt))}
            {submission.late && ' · kechikib topshirilgan'}
          </span>
        </div>
      </div>
      {submission.teacherComment && (
        <p className="rounded-[16px] bg-white px-3.5 py-2.5 text-[15px] font-bold">
          <span className="text-tg-muted">💬 Ustoz: </span>
          {submission.teacherComment}
        </p>
      )}
      {submission.status === 'RETURNED' && (
        <p className="text-[14px] font-bold text-tg-body">Xatolarni tuzating va yangi rasm yoki ovozli xabar qoʻshing — vazifa yana ustozga boradi.</p>
      )}
    </section>
  )
}

/**
 * How to hand in a voice note: record it in the bot chat. The bot files it under the newest open
 * homework, so on an older one the student is told so instead of being sent off to record.
 */
function VoiceHint({ botTarget, full }: { botTarget: boolean; full: boolean }) {
  if (full) return <p className="mt-2 text-center text-[13px] font-bold text-tg-faint">Ovozli xabarlar soni chegaraga yetdi.</p>
  if (!botTarget) {
    return (
      <p className="mt-2 rounded-[18px] bg-tg-sand px-4 py-3 text-center text-[14px] font-bold text-tg-muted">
        Botga yuborilgan ovozli xabar eng yangi vazifaga qoʻshiladi.
      </p>
    )
  }
  return (
    <div className="mt-2 flex flex-col gap-2">
      <p className="rounded-[18px] border-2 border-dashed border-tg-dash bg-white px-4 py-3 text-center text-[14px] font-bold text-tg-muted">
        Speaking vazifasi uchun botga ovozli xabar yozib yuboring 🎤 — u darhol shu vazifaga qoʻshiladi.
      </p>
      {webApp() && (
        <button
          type="button"
          onClick={() => webApp()?.close()}
          className="flex min-h-[56px] items-center justify-center gap-2 rounded-[22px] border-2 border-tg-line-strong bg-white text-base font-extrabold text-tg-blue-dark active:scale-[0.98]"
        >
          <Mic className="h-6 w-6" strokeWidth={2.4} /> Botga oʻtib yozish
        </button>
      )}
    </div>
  )
}

function PickButton({
  icon,
  label,
  tone,
  capture,
  multiple,
  onPick,
}: {
  icon: ReactNode
  label: string
  tone: 'blue' | 'white'
  capture?: boolean
  multiple?: boolean
  onPick: (files: FileList | null) => void
}) {
  return (
    <label
      className={`flex min-h-[88px] cursor-pointer flex-col items-center justify-center gap-1.5 rounded-[22px] text-base font-extrabold active:scale-[0.98] ${
        tone === 'blue' ? 'bg-tg-blue text-white' : 'border-2 border-tg-line-strong bg-white text-tg-blue-dark'
      }`}
    >
      {icon}
      {label}
      <input
        type="file"
        accept="image/*"
        className="hidden"
        {...(capture ? { capture: 'environment' as const } : {})}
        multiple={multiple}
        onChange={(e) => {
          onPick(e.target.files)
          e.target.value = ''
        }}
      />
    </label>
  )
}

/** A stored homework photo -- fetched with the Telegram auth header, then shown from memory. */
function PhotoImage({ photoId, className }: { photoId: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  useEffect(() => {
    let live = true
    miniApi
      .homeworkPhotoUrl(photoId)
      .then((url) => live && setSrc(url))
      .catch(() => {})
    return () => {
      live = false
    }
  }, [photoId])
  if (!src) return <span className={`flex items-center justify-center ${className}`}><Loader2 className="h-6 w-6 animate-spin text-tg-faint" /></span>
  return <img src={src} alt="" className={className} />
}

/** Full-screen photo with previous/next by swiping, and delete while it can still change. */
function PhotoViewer({
  photos,
  index,
  onIndex,
  onClose,
  onDelete,
}: {
  photos: MiniSubmission['photos']
  index: number
  onIndex: (i: number) => void
  onClose: () => void
  onDelete?: (photoId: string) => void
}) {
  const touchX = useRef<number | null>(null)
  // Telegram's in-app browser may not show window.confirm, so deleting takes a second tap.
  const [confirming, setConfirming] = useState(false)
  const photo = photos[index]
  useEffect(() => setConfirming(false), [index])
  return (
    <div
      className="fixed inset-0 z-50 flex flex-col bg-black/95"
      onTouchStart={(e) => (touchX.current = e.touches[0].clientX)}
      onTouchEnd={(e) => {
        if (touchX.current === null) return
        const dx = e.changedTouches[0].clientX - touchX.current
        touchX.current = null
        if (dx < -50 && index < photos.length - 1) onIndex(index + 1)
        if (dx > 50 && index > 0) onIndex(index - 1)
      }}
    >
      <div className="flex items-center justify-between px-4 pb-2 pt-[max(12px,env(safe-area-inset-top))] text-white">
        <span className="text-base font-extrabold">
          {index + 1} / {photos.length}
        </span>
        <span className="flex items-center gap-2">
          {onDelete && (
            <button
              type="button"
              onClick={() => (confirming ? onDelete(photo.id) : setConfirming(true))}
              className={`min-h-11 rounded-2xl px-4 text-[15px] font-extrabold ${confirming ? 'bg-tg-cherry' : 'bg-white/15'}`}
            >
              {confirming ? 'Ha, oʻchirish' : 'Oʻchirish'}
            </button>
          )}
          <button type="button" onClick={onClose} aria-label="Yopish" className="flex h-11 w-11 items-center justify-center rounded-2xl bg-white/15">
            <X className="h-6 w-6" />
          </button>
        </span>
      </div>
      <div className="flex min-h-0 grow items-center justify-center p-2">
        <PhotoImage photoId={photo.id} className="max-h-full max-w-full object-contain" />
      </div>
    </div>
  )
}
