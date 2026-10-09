import { useEffect, useState } from 'react'
import { Download, Loader2 } from 'lucide-react'
import { formatDuration } from './VoiceNote'

/**
 * A homework video: `load` fetches it by id (with whatever auth the app uses) as an object URL,
 * then it plays in the browser's own player. A round video message shows as a circle, the way
 * Telegram shows it. Should the browser not play it, there's a download link instead.
 */
export function HomeworkVideo({
  videoId,
  load,
  duration,
  round,
  className = '',
  labelClassName = 'text-slate-500 dark:text-slate-400',
}: {
  videoId: string
  load: (videoId: string) => Promise<string>
  duration: number
  round: boolean
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
    load(videoId)
      .then((url) => live && setSrc(url))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [videoId, load])

  const frame = round ? 'aspect-square w-48 rounded-full' : 'aspect-video w-full rounded-xl'

  if (failed || !src || unplayable) {
    return (
      <div className={`flex items-center justify-center bg-black/5 dark:bg-white/5 ${frame} ${className}`}>
        {failed ? (
          <span className={`px-3 text-center text-xs ${labelClassName}`}>Video yuklanmadi</span>
        ) : !src ? (
          <span className={`flex items-center gap-2 text-xs ${labelClassName}`}>
            <Loader2 className="h-4 w-4 animate-spin" /> {formatDuration(duration)}
          </span>
        ) : (
          <a href={src} download="video.mp4" className={`flex items-center gap-1.5 text-sm font-medium underline ${labelClassName}`}>
            <Download className="h-4 w-4" /> Yuklab olish · {formatDuration(duration)}
          </a>
        )}
      </div>
    )
  }
  return (
    <video
      controls
      playsInline
      preload="metadata"
      src={src}
      onError={() => setUnplayable(true)}
      className={`bg-black object-cover ${frame} ${className}`}
    />
  )
}
