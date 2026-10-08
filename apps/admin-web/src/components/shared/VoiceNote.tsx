import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'

/** 75 → "1:15". */
export function formatDuration(seconds: number): string {
  return `${Math.floor(seconds / 60)}:${String(seconds % 60).padStart(2, '0')}`
}

/**
 * A homework voice note: `load` fetches it by id (with whatever auth the app uses) as an object URL,
 * then it plays in the browser's own player. Telegram records Ogg/Opus, which some older
 * browsers (older iPhones) can't play -- those get a download link instead.
 */
export function VoiceNote({
  voiceId,
  load,
  duration,
  className = '',
  labelClassName = 'text-slate-500 dark:text-slate-400',
}: {
  voiceId: string
  load: (voiceId: string) => Promise<string>
  duration: number
  className?: string
  labelClassName?: string
}) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [unplayable, setUnplayable] = useState(false)

  useEffect(() => {
    let live = true
    setSrc(null)
    setFailed(false)
    load(voiceId)
      .then((url) => live && setSrc(url))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [voiceId, load])

  return (
    <div className={`flex min-w-0 items-center gap-2 ${className}`}>
      {failed ? (
        <span className={`text-xs ${labelClassName}`}>Ovozli xabar yuklanmadi</span>
      ) : !src ? (
        <span className={`flex h-10 items-center gap-2 text-xs ${labelClassName}`}>
          <Loader2 className="h-4 w-4 animate-spin" /> {formatDuration(duration)}
        </span>
      ) : unplayable ? (
        <a href={src} download="ovozli-xabar.ogg" className={`flex h-10 items-center gap-1.5 text-sm font-medium underline ${labelClassName}`}>
          <Download className="h-4 w-4" /> Yuklab olish · {formatDuration(duration)}
        </a>
      ) : (
        <audio controls preload="metadata" src={src} onError={() => setUnplayable(true)} className="h-10 w-full min-w-0" />
      )}
    </div>
  )
}
