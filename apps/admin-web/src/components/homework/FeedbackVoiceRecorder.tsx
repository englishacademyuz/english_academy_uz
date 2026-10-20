import { useEffect, useRef, useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { Mic, RotateCcw, Square, Trash2, X } from 'lucide-react'
import { toast } from 'react-toastify'
import { ApiError, homeworkSubmissions as submissionsApi } from '../../lib/api'
import type { HomeworkSubmission } from '../../lib/types'
import { formatDuration, VoiceNote } from '../shared/VoiceNote'
import { Button } from '../ui'

/** A spoken comment is for a few sentences, not a lecture -- and has to stay under what Telegram plays back. */
const MAX_SECONDS = 5 * 60

/**
 * What the browser records in, best first: Ogg (Firefox) and WebM (Chrome, Edge) both hold Opus,
 * which the server turns into a Telegram voice note; MP4 is Safari's fallback.
 */
function recordingType(): string | undefined {
  return ['audio/ogg;codecs=opus', 'audio/webm;codecs=opus', 'audio/mp4'].find((t) =>
    MediaRecorder.isTypeSupported(t),
  )
}

function recordingError(err: unknown): string {
  if (
    err instanceof DOMException &&
    (err.name === 'NotAllowedError' || err.name === 'SecurityError')
  )
    return 'Mikrofonga ruxsat berilmadi — brauzer sozlamalarida ruxsat bering'
  if (err instanceof DOMException && err.name === 'NotFoundError') return 'Mikrofon topilmadi'
  if (err instanceof ApiError && err.message === 'UNSUPPORTED_AUDIO')
    return 'Bu yozuvni ovozli xabar qilib boʻlmadi — qayta yozib koʻring'
  if (err instanceof ApiError) return err.message
  return 'Ovozli izohni saqlab boʻlmadi'
}

type Recording = { recorder: MediaRecorder; stream: MediaStream; startedAt: number; keep: boolean }

/**
 * The teacher's spoken feedback on one submission: recorded right here, listened back, recorded
 * again or taken off. It is saved on the submission as soon as recording stops, and reaches the
 * family with the verdict. Remount it (a `key`) for another submission -- a recording still going
 * is thrown away.
 */
export function FeedbackVoiceRecorder({
  submission,
  onChange,
  onBusyChange,
}: {
  submission: HomeworkSubmission
  onChange: (submission: HomeworkSubmission) => void
  /** True while recording or saving -- the verdict waits for it. */
  onBusyChange: (busy: boolean) => void
}) {
  const [recording, setRecording] = useState<Recording | null>(null)
  const [seconds, setSeconds] = useState(0)
  const current = useRef<Recording | null>(null)

  const save = useMutation({
    mutationFn: (audio: Blob) => submissionsApi.recordFeedbackVoice(submission.id, audio),
    onSuccess: onChange,
    onError: (err) => toast.error(recordingError(err)),
  })
  const remove = useMutation({
    mutationFn: () => submissionsApi.removeFeedbackVoice(submission.id),
    onSuccess: onChange,
    onError: (err) => toast.error(recordingError(err)),
  })

  const busy = recording !== null || save.isPending
  useEffect(() => onBusyChange(busy), [busy, onBusyChange])

  useEffect(() => {
    if (!recording) return
    const timer = window.setInterval(() => {
      const elapsed = Math.floor((Date.now() - recording.startedAt) / 1000)
      setSeconds(elapsed)
      if (elapsed >= MAX_SECONDS) stop(true)
    }, 250)
    return () => window.clearInterval(timer)
  }, [recording])

  // Leaving (closing the review, moving to another student) mid-recording throws it away.
  useEffect(
    () => () => {
      if (current.current) stop(false)
    },
    [],
  )

  async function start() {
    if (!navigator.mediaDevices?.getUserMedia || typeof MediaRecorder === 'undefined') {
      toast.error('Bu brauzer ovoz yozolmaydi — Chrome yoki Edge’dan foydalaning')
      return
    }
    try {
      const stream = await navigator.mediaDevices.getUserMedia({
        audio: { channelCount: 1, echoCancellation: true, noiseSuppression: true },
      })
      const type = recordingType()
      const recorder = new MediaRecorder(
        stream,
        type ? { mimeType: type, audioBitsPerSecond: 32_000 } : undefined,
      )
      const chunks: Blob[] = []
      const rec: Recording = { recorder, stream, startedAt: Date.now(), keep: false }
      recorder.ondataavailable = (e) => e.data.size > 0 && chunks.push(e.data)
      recorder.onstop = () => {
        stream.getTracks().forEach((t) => t.stop())
        current.current = null
        setRecording(null)
        if (!rec.keep) return
        if (Date.now() - rec.startedAt < 1000) {
          toast.info('Juda qisqa — tugmani bosib, gapirib, keyin toʻxtating')
          return
        }
        save.mutate(new Blob(chunks, { type: recorder.mimeType || type || 'audio/webm' }))
      }
      recorder.start(1000)
      current.current = rec
      setSeconds(0)
      setRecording(rec)
    } catch (err) {
      toast.error(recordingError(err))
    }
  }

  /** Ends the recording -- saved when `keep`, else thrown away. */
  function stop(keep: boolean) {
    const rec = current.current
    if (!rec) return
    rec.keep = keep
    if (rec.recorder.state !== 'inactive') rec.recorder.stop()
  }

  const voice = submission.feedbackVoice

  return (
    <div className="space-y-2">
      <span className="flex items-center gap-1.5 text-sm font-medium text-slate-700 dark:text-slate-300">
        <Mic className="h-4 w-4" /> Ovozli izoh
      </span>

      {recording ? (
        <div className="flex items-center gap-2 rounded-lg border border-red-200 bg-red-50 px-3 py-2 dark:border-red-500/30 dark:bg-red-500/10">
          <span className="h-2.5 w-2.5 animate-pulse rounded-full bg-red-500" aria-hidden />
          <span className="grow text-sm font-medium tabular-nums text-red-700 dark:text-red-300">
            {formatDuration(seconds)}{' '}
            <span className="font-normal text-red-500/80">/ {formatDuration(MAX_SECONDS)}</span>
          </span>
          <button
            type="button"
            onClick={() => stop(false)}
            title="Bekor qilish"
            aria-label="Bekor qilish"
            className="rounded-md p-1.5 text-red-400 hover:bg-red-100 dark:hover:bg-red-500/20"
          >
            <X className="h-4 w-4" />
          </button>
          <Button variant="destructive" size="sm" onClick={() => stop(true)} className="gap-1.5">
            <Square className="h-3.5 w-3.5 fill-current" /> Toʻxtatish
          </Button>
        </div>
      ) : save.isPending ? (
        <Button variant="secondary" className="w-full justify-center" loading>
          Saqlanmoqda…
        </Button>
      ) : voice ? (
        <div className="space-y-1.5">
          <VoiceNote
            key={voice.id}
            voiceId={voice.id}
            load={submissionsApi.feedbackVoiceUrl}
            duration={voice.duration}
          />
          <div className="flex gap-2">
            <Button
              variant="secondary"
              size="sm"
              className="grow justify-center gap-1.5"
              onClick={start}
            >
              <RotateCcw className="h-3.5 w-3.5" /> Qayta yozish
            </Button>
            <Button
              variant="danger"
              size="sm"
              className="gap-1.5"
              loading={remove.isPending}
              onClick={() => remove.mutate()}
              title="Ovozli izohni oʻchirish"
              aria-label="Ovozli izohni oʻchirish"
            >
              <Trash2 className="h-3.5 w-3.5" />
            </Button>
          </div>
        </div>
      ) : (
        <Button variant="secondary" className="w-full justify-center gap-1.5" onClick={start}>
          <Mic className="h-4 w-4" /> Ovoz yozish
        </Button>
      )}
    </div>
  )
}
