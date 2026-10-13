import { useEffect, useRef, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { Camera, Clapperboard, FileAudio, ImagePlus, Loader2, Mic, RotateCw, Send, Trash2, X } from 'lucide-react'
import { HomeworkVideo } from '../../components/shared/HomeworkVideo'
import { RichText } from '../../components/shared/RichText'
import { VoiceNote } from '../../components/shared/VoiceNote'
import { shrinkPhoto } from '../../lib/image'
import { isRichTextEmpty } from '../../lib/richText'
import { MiniApiError, miniApi } from '../api'
import { CheckIcon, LateSticker } from '../components/art'
import { DeadlineBar } from '../components/Deadline'
import { TaskPicture } from '../components/HomeworkImages'
import { useNow } from '../deadline'
import { ErrorState, Loading, Screen } from '../components/kit'
import { formatDateTime, weekdayDayMonth } from '../format'
import { haptic, webApp } from '../telegram'
import type { MiniHomeworkDetail, MiniHomeworkImage, MiniSubmission } from '../types'

type FileKind = 'photo' | 'video' | 'audio'

/** A file on its way up: a photo shows its preview, a video or recording only its kind. */
type Pending = { key: string; kind: FileKind; file: Blob; preview: string | null; failed: boolean }

/** The biggest video or recording the server takes -- what Telegram can hand back for playback. */
const MAX_MEDIA_BYTES = 20 * 1024 * 1024

const UPLOAD_ERRORS: Record<string, string> = {
  TOO_MANY_PHOTOS: 'Rasmlar soni chegaraga yetdi',
  TOO_MANY_VOICES: 'Audiolar soni chegaraga yetdi',
  TOO_MANY_VIDEOS: 'Videolar soni chegaraga yetdi',
  ALREADY_CHECKED: 'Ustoz bu vazifani allaqachon tekshirgan',
  SUBMISSIONS_DISABLED: 'Bu guruhda vazifa platforma orqali topshirilmaydi',
  DEADLINE_PASSED: 'Topshirish muddati tugagan',
  UNSUPPORTED_VIDEO: 'Bu videoni ochib boʻlmadi — boshqa formatda yuboring',
  UNSUPPORTED_AUDIO: 'Bu audioni ochib boʻlmadi — botga ovozli xabar qilib yuboring',
}

const FAILED_UPLOAD: Record<FileKind, string> = {
  photo: 'Rasmni yuborib boʻlmadi',
  video: 'Videoni yuborib boʻlmadi',
  audio: 'Audioni yuborib boʻlmadi',
}

type Task = MiniHomeworkDetail['tasks'][number]

/**
 * Topshirish: one homework, task by task -- the written homework and each picture the teacher
 * gave are handed in separately, each on its own deadline. Every task has its own card: what to
 * do, how long is left, what the student has handed in for it, and buttons to add photos, videos
 * and audio recordings (or to record a voice note in the bot chat). Once a task's deadline has
 * passed, nothing more can be added to it or taken out -- unless the teacher sent it back.
 */
export function HomeworkSubmitPage() {
  const { id } = useParams<{ id: string }>()
  const queryClient = useQueryClient()
  const queryKey = ['mini', 'homework', id]
  const homework = useQuery({ queryKey, queryFn: () => miniApi.homeworkDetail(id!), enabled: !!id })
  const back = { to: '/student/homework', label: 'Vazifalar' }

  function setSubmission(task: string, submission: MiniSubmission | null) {
    queryClient.setQueryData<MiniHomeworkDetail>(
      queryKey,
      (old) => old && { ...old, tasks: old.tasks.map((t) => (t.task === task ? { ...t, submission } : t)) },
    )
    queryClient.invalidateQueries({ queryKey: ['mini', 'homework'], exact: true })
    queryClient.invalidateQueries({ queryKey: ['mini', 'lesson', id] })
    queryClient.invalidateQueries({ queryKey: ['mini', 'home'] })
  }

  if (homework.isLoading) return <Loading />
  if (homework.error || !homework.data) {
    return (
      <Screen back={back} title="Uyga vazifa">
        <ErrorState error={homework.error} onRetry={() => homework.refetch()} />
      </Screen>
    )
  }

  const data = homework.data
  return (
    <Screen back={back} eyebrow={weekdayDayMonth(new Date(data.date))} title={data.topic || 'Uyga vazifa'} subtitle={data.group}>
      {data.tasks.length > 1 && (
        <p className="rounded-[18px] bg-tg-sand px-4 py-3 text-center text-[14px] font-bold text-tg-muted">
          {data.tasks.length} ta vazifa — har birini alohida topshiring, har birining oʻz muddati bor.
        </p>
      )}
      {data.tasks.map((task, i) => (
        <TaskCard
          key={task.task}
          lessonId={data.lessonId}
          task={task}
          number={data.tasks.length > 1 ? i + 1 : null}
          instructions={data.instructions}
          image={data.images.find((image) => image.id === task.imageId) ?? null}
          submissionEnabled={data.submissionEnabled}
          limits={{ photo: data.maxPhotos, audio: data.maxVoices, video: data.maxVideos }}
          onSubmission={(submission) => setSubmission(task.task, submission)}
          onClosed={() => homework.refetch()}
        />
      ))}
    </Screen>
  )
}

function TaskCard({
  lessonId,
  task,
  number,
  instructions,
  image,
  submissionEnabled,
  limits,
  onSubmission,
  onClosed,
}: {
  lessonId: string
  task: Task
  /** Its number among several tasks; null when it's the only one. */
  number: number | null
  instructions: string
  image: MiniHomeworkImage | null
  submissionEnabled: boolean
  limits: Record<FileKind, number>
  onSubmission: (submission: MiniSubmission | null) => void
  /** The deadline passed while the page was open -- show it closed. */
  onClosed: () => void
}) {
  const [pending, setPending] = useState<Pending[]>([])
  const [error, setError] = useState<string | null>(null)
  const [viewing, setViewing] = useState<number | null>(null)
  const [toBot, setToBot] = useState(false)
  // Files waiting to go up, in the order they were picked -- one upload at a time.
  const queue = useRef<Pending[]>([])
  const uploading = useRef(false)
  const now = useNow()

  const { submission } = task
  const photos = submission?.photos ?? []
  const voices = submission?.voices ?? []
  const videos = submission?.videos ?? []
  // A submission sent back to be redone stays open past the deadline.
  const late = !!task.dueDate && now.getTime() >= new Date(task.dueDate).getTime() && submission?.status !== 'RETURNED'
  const open = submissionEnabled && submission?.status !== 'CHECKED' && !late
  const waiting = (kind: FileKind) => pending.filter((p) => p.kind === kind && !p.failed).length
  const room: Record<FileKind, number> = {
    photo: limits.photo - photos.length - waiting('photo'),
    video: limits.video - videos.length - waiting('video'),
    audio: limits.audio - voices.length - waiting('audio'),
  }
  const name = task.name ?? (number ? 'Yozma vazifa' : 'Uyga vazifa')

  function upload(item: Pending) {
    if (item.kind === 'photo') return miniApi.uploadHomeworkPhoto(lessonId, task.task, item.file)
    if (item.kind === 'video') return miniApi.uploadHomeworkVideo(lessonId, task.task, item.file as File)
    return miniApi.uploadHomeworkAudio(lessonId, task.task, item.file as File)
  }

  // A failed file stays on screen with a retry button; the rest keep going.
  async function drain() {
    if (uploading.current) return
    uploading.current = true
    let failures = 0
    for (let item = queue.current.shift(); item; item = queue.current.shift()) {
      try {
        onSubmission(await upload(item))
        if (item.preview) URL.revokeObjectURL(item.preview)
        setPending((list) => list.filter((p) => p.key !== item.key))
      } catch (err) {
        const code = err instanceof MiniApiError ? err.message : ''
        if (code === 'DEADLINE_PASSED') onClosed()
        setError(
          UPLOAD_ERRORS[code] ??
            (err instanceof MiniApiError && err.statusCode === 413
              ? 'Fayl juda katta (20 MB gacha)'
              : err instanceof TypeError
                ? 'Internet aloqasini tekshiring'
                : FAILED_UPLOAD[item.kind]),
        )
        const failed = item
        setPending((list) => list.map((p) => (p.key === failed.key ? { ...p, failed: true } : p)))
        failures += 1
      }
    }
    uploading.current = false
    haptic(failures ? 'error' : 'success')
  }

  async function addFiles(kind: FileKind, files: FileList | null) {
    if (!files?.length) return
    setError(null)
    let picked = [...files]
    if (kind !== 'photo') {
      const tooBig = picked.filter((f) => f.size > MAX_MEDIA_BYTES)
      if (tooBig.length) setError('Fayl juda katta (20 MB gacha). Qisqaroq yozib yuboring.')
      picked = picked.filter((f) => f.size <= MAX_MEDIA_BYTES)
    }
    if (picked.length > room[kind]) setError(`Yana faqat ${Math.max(room[kind], 0)} ta qoʻshish mumkin`)
    picked = picked.slice(0, Math.max(room[kind], 0))
    const items = await Promise.all(
      picked.map(async (file, i): Promise<Pending> => {
        if (kind !== 'photo') return { key: `${Date.now()}-${i}`, kind, file, preview: null, failed: false }
        const blob = await shrinkPhoto(file)
        return { key: `${Date.now()}-${i}`, kind, file: blob, preview: URL.createObjectURL(blob), failed: false }
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

  async function removeFile(kind: FileKind, fileId: string) {
    try {
      const remove = { photo: miniApi.deleteHomeworkPhoto, audio: miniApi.deleteHomeworkVoice, video: miniApi.deleteHomeworkVideo }[kind]
      onSubmission((await remove(fileId)).submission)
      setViewing(null)
    } catch {
      setError({ photo: 'Rasmni', audio: 'Audioni', video: 'Videoni' }[kind] + ' oʻchirib boʻlmadi')
    }
  }

  // "Record it in the bot": point the bot at this task, then hand over to the chat.
  async function sendThroughBot() {
    setError(null)
    setToBot(true)
    try {
      await miniApi.sendHomeworkThroughBot(lessonId, task.task)
      haptic('success')
      webApp()?.close()
    } catch (err) {
      const code = err instanceof MiniApiError ? err.message : ''
      setError(UPLOAD_ERRORS[code] ?? 'Bogʻlanib boʻlmadi, qayta urinib koʻring')
    } finally {
      setToBot(false)
    }
  }

  const pendingPhotos = pending.filter((p) => p.kind === 'photo')
  const pendingMedia = pending.filter((p) => p.kind !== 'photo')
  const nothingYet = photos.length + voices.length + videos.length + pending.length === 0

  return (
    <section className="flex flex-col gap-3 overflow-hidden rounded-[26px] border-[3px] border-tg-line bg-white">
      <header className="flex items-center gap-2.5 px-4 pt-4">
        {number !== null && (
          <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tg-grape-2 font-tg-display text-lg font-semibold text-white">
            {number}
          </span>
        )}
        <span className="min-w-0 grow truncate font-tg-display text-[20px] font-semibold leading-tight text-tg-ink">
          {task.imageId ? '🖼 ' : '📝 '}
          {name}
        </span>
        {submissionEnabled && <StatusChip submission={submission} />}
      </header>
      {task.dueDate && <DeadlineBar due={new Date(task.dueDate)} />}

      <div className="flex flex-col gap-3 px-4 pb-4">
        {image ? (
          <TaskPicture image={image} name={name} />
        ) : (
          !isRichTextEmpty(instructions) && (
            <div className="rounded-[18px] bg-tg-sun-soft px-4 py-3">
              <RichText value={instructions} variant="tg" />
            </div>
          )
        )}

        {!submissionEnabled ? (
          <div className="flex items-center justify-center gap-2 rounded-[18px] border-[3px] border-tg-leaf bg-tg-leaf-soft px-3 py-3.5 text-base font-extrabold text-tg-leaf-dark">
            <CheckIcon size={22} />
            Ustoz darsda tekshiradi
          </div>
        ) : (
          <>
            <StatusBanner submission={submission} />
            {late && submission?.status !== 'CHECKED' && <DeadlinePassed dueDate={new Date(task.dueDate!)} handedIn={!!submission} />}

            {nothingYet && open && (
              <p className="rounded-[18px] border-2 border-dashed border-tg-dash px-4 py-4 text-center text-[15px] font-bold text-tg-muted">
                Vazifani bajarib, suratga oling, video yoki audio yozing — shu yerdan yuboring.
              </p>
            )}

            {(photos.length > 0 || pendingPhotos.length > 0) && (
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
                {pendingPhotos.map((item) => (
                  <div key={item.key} className="relative aspect-[3/4] overflow-hidden rounded-[18px] border-2 border-tg-line">
                    <img src={item.preview!} alt="" className="h-full w-full object-cover opacity-60" />
                    <span className="absolute inset-0 flex items-center justify-center">
                      <PendingState item={item} onRetry={retry} />
                    </span>
                  </div>
                ))}
              </div>
            )}

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
                        onClick={() => removeFile('audio', voice.id)}
                        aria-label="Audioni oʻchirish"
                        className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full text-tg-cherry active:bg-tg-cherry-soft"
                      >
                        <Trash2 className="h-5 w-5" strokeWidth={2.4} />
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

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
                        onClick={() => removeFile('video', video.id)}
                        className="flex min-h-10 items-center gap-1.5 rounded-full px-4 text-[14px] font-extrabold text-tg-cherry active:bg-tg-cherry-soft"
                      >
                        <Trash2 className="h-4 w-4" strokeWidth={2.4} /> Oʻchirish
                      </button>
                    )}
                  </div>
                ))}
              </div>
            )}

            {pendingMedia.map((item) => (
              <div key={item.key} className="flex items-center gap-3 rounded-[18px] border-2 border-tg-line bg-tg-sand px-3 py-2.5">
                <span className="text-2xl" aria-hidden>
                  {item.kind === 'video' ? '🎬' : '🎤'}
                </span>
                <span className="min-w-0 grow truncate text-[15px] font-bold text-tg-muted">
                  {item.failed ? 'Yuborilmadi' : `${item.kind === 'video' ? 'Video' : 'Audio'} yuborilmoqda…`}
                </span>
                <PendingState item={item} onRetry={retry} />
              </div>
            ))}

            {error && <p className="rounded-[18px] bg-tg-cherry-soft px-4 py-3 text-center text-[15px] font-extrabold text-tg-cherry">{error}</p>}

            {open && (
              <>
                <div className="grid grid-cols-2 gap-2.5">
                  <PickButton
                    icon={<Camera className="h-7 w-7" strokeWidth={2.4} />}
                    label="Suratga olish"
                    tone="blue"
                    accept="image/*"
                    capture
                    disabled={room.photo <= 0}
                    onPick={(f) => addFiles('photo', f)}
                  />
                  <PickButton
                    icon={<ImagePlus className="h-7 w-7" strokeWidth={2.4} />}
                    label="Galereyadan"
                    tone="white"
                    accept="image/*"
                    multiple
                    disabled={room.photo <= 0}
                    onPick={(f) => addFiles('photo', f)}
                  />
                  <PickButton
                    icon={<Clapperboard className="h-7 w-7" strokeWidth={2.4} />}
                    label="Video"
                    tone="white"
                    accept="video/*"
                    disabled={room.video <= 0}
                    onPick={(f) => addFiles('video', f)}
                  />
                  <PickButton
                    icon={<FileAudio className="h-7 w-7" strokeWidth={2.4} />}
                    label="Audio"
                    tone="white"
                    accept="audio/*"
                    disabled={room.audio <= 0}
                    onPick={(f) => addFiles('audio', f)}
                  />
                </div>
                {webApp() && (
                  <button
                    type="button"
                    onClick={sendThroughBot}
                    disabled={toBot}
                    className="flex min-h-[52px] items-center justify-center gap-2 rounded-[20px] border-2 border-tg-line-strong bg-white text-[15px] font-extrabold text-tg-blue-dark active:scale-[0.98] disabled:opacity-60"
                  >
                    {toBot ? <Loader2 className="h-5 w-5 animate-spin" /> : <Mic className="h-5 w-5" strokeWidth={2.4} />}
                    Botda ovozli xabar yoki video yozish
                    <Send className="h-4 w-4" strokeWidth={2.4} />
                  </button>
                )}
                <p className="text-center text-[13px] font-bold text-tg-faint">
                  {task.botTarget
                    ? 'Botga yuborilgan ovozli xabar va videolar shu vazifaga qoʻshiladi. '
                    : ''}
                  Koʻpi bilan {limits.photo} ta rasm, {limits.video} ta video, {limits.audio} ta audio · video va audio 20 MB gacha.
                </p>
              </>
            )}
          </>
        )}
      </div>

      {viewing !== null && photos[viewing] && (
        <PhotoViewer
          photos={photos}
          index={viewing}
          onIndex={setViewing}
          onClose={() => setViewing(null)}
          onDelete={open ? (photoId) => removeFile('photo', photoId) : undefined}
        />
      )}
    </section>
  )
}

/** A spinner while a file goes up; a retry button once it failed. */
function PendingState({ item, onRetry }: { item: Pending; onRetry: (item: Pending) => void }) {
  if (!item.failed) return <Loader2 className="h-8 w-8 shrink-0 animate-spin text-tg-blue" />
  return (
    <button
      type="button"
      onClick={() => onRetry(item)}
      aria-label="Qayta yuborish"
      className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tg-cherry text-white"
    >
      <RotateCw className="h-5 w-5" strokeWidth={2.5} />
    </button>
  )
}

/** Where a task stands, at a glance in its card's corner. */
function StatusChip({ submission }: { submission: MiniSubmission | null }) {
  const look = !submission
    ? { cls: 'bg-tg-sand text-tg-muted', text: 'Topshirilmagan' }
    : {
        SUBMITTED: { cls: 'bg-tg-leaf-soft text-tg-leaf-dark', text: '✅ Topshirildi' },
        RETURNED: { cls: 'bg-tg-cherry-soft text-tg-cherry', text: '🔁 Qayta' },
        CHECKED: { cls: 'bg-tg-blue-soft text-tg-blue-dark', text: '⭐ Tekshirildi' },
      }[submission.status]
  return <span className={`shrink-0 rounded-full px-2.5 py-1 text-[12px] font-extrabold ${look.cls}`}>{look.text}</span>
}

/** Too late: the deadline has passed, so the buttons are gone -- said with a sad sticker. */
function DeadlinePassed({ dueDate, handedIn }: { dueDate: Date; handedIn: boolean }) {
  return (
    <section className="flex flex-col items-center gap-2 rounded-[22px] border-[3px] border-tg-cherry bg-tg-cherry-soft px-4 py-4 text-center">
      <LateSticker size={88} />
      <span className="font-tg-display text-xl font-semibold leading-tight text-tg-cherry">Muddat oʻtib ketdi</span>
      <span className="text-[14px] font-bold text-tg-muted">Muddat: {formatDateTime(dueDate.toISOString())} gacha edi</span>
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
        <p className="text-[14px] font-bold text-tg-body">Xatolarni tuzating va yangi rasm, video yoki audio qoʻshing — vazifa yana ustozga boradi.</p>
      )}
    </section>
  )
}

function PickButton({
  icon,
  label,
  tone,
  accept,
  capture,
  multiple,
  disabled,
  onPick,
}: {
  icon: ReactNode
  label: string
  tone: 'blue' | 'white'
  accept: string
  capture?: boolean
  multiple?: boolean
  disabled?: boolean
  onPick: (files: FileList | null) => void
}) {
  return (
    <label
      aria-disabled={disabled}
      className={`flex min-h-[80px] flex-col items-center justify-center gap-1.5 rounded-[22px] text-base font-extrabold ${
        disabled ? 'pointer-events-none opacity-40' : 'cursor-pointer active:scale-[0.98]'
      } ${tone === 'blue' ? 'bg-tg-blue text-white' : 'border-2 border-tg-line-strong bg-white text-tg-blue-dark'}`}
    >
      {icon}
      {label}
      <input
        type="file"
        accept={accept}
        className="hidden"
        disabled={disabled}
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
