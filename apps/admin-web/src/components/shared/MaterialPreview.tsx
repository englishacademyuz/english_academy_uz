import { materialTypeLabel } from '../../lib/format'
import { docEmbedUrl, parseHttpUrl, videoEmbedUrl } from '../../lib/materials'
import type { LessonMaterial } from '../../lib/types'

const frameClass = 'aspect-video w-full rounded-lg border border-slate-200 dark:border-slate-700 bg-black'

const extensionOf = (url: URL) => url.pathname.split('.').pop()?.toLowerCase() ?? ''
const VIDEO_EXT = ['mp4', 'webm', 'ogg', 'mov', 'm4v']
const AUDIO_EXT = ['mp3', 'wav', 'ogg', 'm4a', 'aac']
const IMAGE_EXT = ['png', 'jpg', 'jpeg', 'gif', 'webp', 'svg']

function Embed({ material }: { material: LessonMaterial }) {
  const url = parseHttpUrl(material.content)
  if (material.type === 'TEXT' || !url) {
    return <p className="whitespace-pre-wrap text-sm text-slate-700 dark:text-slate-300">{material.content}</p>
  }

  const embed = videoEmbedUrl(url)
  if (embed) {
    return (
      <iframe
        src={embed}
        title="Video"
        className={frameClass}
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    )
  }

  const doc = docEmbedUrl(url)
  if (doc) {
    return <iframe src={doc} title="Hujjat" className="h-[32rem] w-full rounded-lg border border-slate-200 dark:border-slate-700" />
  }

  const ext = extensionOf(url)
  if (material.type === 'VIDEO' || VIDEO_EXT.includes(ext)) {
    return <video src={url.href} controls className={frameClass} />
  }
  if (material.type === 'AUDIO' || AUDIO_EXT.includes(ext)) {
    return <audio src={url.href} controls className="w-full" />
  }
  if (material.type === 'IMAGE' || IMAGE_EXT.includes(ext)) {
    return (
      <a href={url.href} target="_blank" rel="noreferrer">
        <img src={url.href} alt="" className="max-h-96 rounded-lg border border-slate-200 dark:border-slate-700" />
      </a>
    )
  }
  if (material.type === 'PDF' || ext === 'pdf') {
    return <iframe src={url.href} title="PDF" className="h-[32rem] w-full rounded-lg border border-slate-200 dark:border-slate-700" />
  }

  return null
}

export function MaterialPreview({ material }: { material: LessonMaterial }) {
  const url = parseHttpUrl(material.content)
  const isLink = material.type !== 'TEXT' && url

  return (
    <div className="space-y-2">
      <p className="truncate text-sm text-slate-700 dark:text-slate-300">
        <span className="mr-2 font-medium text-slate-500 dark:text-slate-400">{materialTypeLabel[material.type]}</span>
        {isLink && (
          <a href={url.href} target="_blank" rel="noreferrer" className="text-brand-600 dark:text-brand-400 hover:underline">
            {material.content}
          </a>
        )}
      </p>
      <Embed material={material} />
    </div>
  )
}
