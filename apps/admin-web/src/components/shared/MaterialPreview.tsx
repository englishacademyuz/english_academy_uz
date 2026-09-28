import { useState } from 'react'
import { ExternalLink, FileSpreadsheet, FileText, HardDrive, Link2, Play, Presentation, X } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { docEmbedUrl, docKind, isYoutubeUrl, parseHttpUrl, videoEmbedUrl, youtubeId, type DocKind } from '../../lib/materials'
import type { LessonMaterial, LessonMaterialType } from '../../lib/types'

type MaterialLike = { type: LessonMaterialType; content: string }

const DOC_LOOK: Record<DocKind, { icon: LucideIcon; label: string; tile: string }> = {
  document: { icon: FileText, label: 'Hujjat', tile: 'from-blue-500 to-blue-600' },
  spreadsheet: { icon: FileSpreadsheet, label: 'Jadval', tile: 'from-emerald-500 to-emerald-600' },
  presentation: { icon: Presentation, label: 'Taqdimot', tile: 'from-amber-400 to-orange-500' },
  drive: { icon: HardDrive, label: 'Fayl', tile: 'from-slate-500 to-slate-600' },
  other: { icon: Link2, label: 'Manba', tile: 'from-violet-500 to-indigo-500' },
}

/** What a material looks like -- the icon and name shown instead of its raw link. */
export function materialLook(material: MaterialLike) {
  if (material.type === 'VIDEO' && isYoutubeUrl(material.content)) {
    return { kind: 'youtube' as const, label: 'YouTube video', icon: Play, tile: 'from-red-500 to-red-600' }
  }
  return { kind: 'doc' as const, ...DOC_LOOK[docKind(material.content)] }
}

/** Small icon + name chip -- used where materials are listed for editing. */
export function MaterialChip({ material, index }: { material: MaterialLike; index?: number }) {
  const look = materialLook(material)
  const Icon = look.icon
  return (
    <span className="inline-flex min-w-0 items-center gap-2">
      <span className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-md bg-gradient-to-br text-white shadow-sm ${look.tile}`}>
        <Icon className={`h-3.5 w-3.5 ${look.kind === 'youtube' ? 'fill-current' : ''}`} />
      </span>
      <span className="truncate text-sm font-medium text-slate-700 dark:text-slate-200">
        {look.label}
        {index !== undefined && <span className="ml-1 text-slate-400">#{index + 1}</span>}
      </span>
    </span>
  )
}

/** Plays or embeds one material inline (YouTube player, Docs/Sheets/Slides preview). */
export function MaterialViewer({ material }: { material: MaterialLike }) {
  const url = parseHttpUrl(material.content)
  if (!url) return null
  const video = videoEmbedUrl(url)
  if (video) {
    return (
      <iframe
        src={video}
        title="Video"
        className="aspect-video w-full rounded-lg bg-black"
        allow="accelerometer; autoplay; clipboard-write; encrypted-media; gyroscope; picture-in-picture"
        allowFullScreen
      />
    )
  }
  const doc = docEmbedUrl(url)
  if (doc) return <iframe src={doc} title="Hujjat" className="h-[32rem] w-full rounded-lg border border-slate-200 bg-white dark:border-slate-700" />
  return (
    <p className="rounded-lg bg-slate-50 p-4 text-center text-sm text-slate-500 dark:bg-slate-800/60 dark:text-slate-400">
      Bu manbani bu yerda koʻrsatib boʻlmaydi — yangi oynada oching.
    </p>
  )
}

/**
 * A lesson's sources as a row of tiles (YouTube thumbnail, Docs/Sheets/Slides
 * icon) -- links are never printed. Tapping a tile opens it in a viewer below.
 */
export function MaterialGallery({ materials }: { materials: Array<LessonMaterial | MaterialLike> }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const open = openIndex !== null ? materials[openIndex] : null

  return (
    <div className="space-y-3">
      <div className="grid grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4">
        {materials.map((m, i) => {
          const look = materialLook(m)
          const Icon = look.icon
          const thumb = look.kind === 'youtube' ? youtubeId(m.content) : null
          const active = openIndex === i
          return (
            <button
              key={'id' in m ? m.id : i}
              type="button"
              onClick={() => setOpenIndex(active ? null : i)}
              className={`group relative flex aspect-video flex-col justify-end overflow-hidden rounded-xl bg-gradient-to-br text-left text-white shadow-sm transition-all hover:-translate-y-0.5 hover:shadow-md ${look.tile} ${
                active ? 'ring-2 ring-brand-500 ring-offset-2 dark:ring-offset-slate-900' : ''
              }`}
            >
              {thumb && (
                <img
                  src={`https://i.ytimg.com/vi/${thumb}/mqdefault.jpg`}
                  alt=""
                  loading="lazy"
                  className="absolute inset-0 h-full w-full object-cover transition-transform group-hover:scale-105"
                />
              )}
              <span className="absolute inset-0 bg-gradient-to-t from-black/60 via-black/10 to-transparent" />
              <span className="absolute inset-0 flex items-center justify-center">
                <span
                  className={`flex h-10 w-10 items-center justify-center rounded-full shadow-lg transition-transform group-hover:scale-110 ${
                    thumb ? 'bg-red-600' : 'bg-white/20 backdrop-blur'
                  }`}
                >
                  <Icon className={`h-5 w-5 ${look.kind === 'youtube' ? 'ml-0.5 fill-current' : ''}`} />
                </span>
              </span>
              <span className="relative px-2.5 pb-2 text-xs font-semibold drop-shadow">
                {look.label} <span className="opacity-70">#{i + 1}</span>
              </span>
            </button>
          )
        })}
      </div>

      {open && (
        <div className="overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
          <div className="flex items-center justify-between gap-2 border-b border-slate-100 bg-slate-50 px-3 py-2 dark:border-slate-800 dark:bg-slate-800/60">
            <MaterialChip material={open} index={openIndex!} />
            <span className="flex items-center gap-1">
              <a
                href={parseHttpUrl(open.content)?.href}
                target="_blank"
                rel="noreferrer"
                title="Yangi oynada ochish"
                className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <ExternalLink className="h-4 w-4" />
              </a>
              <button
                type="button"
                onClick={() => setOpenIndex(null)}
                title="Yopish"
                className="rounded-md p-1.5 text-slate-400 hover:bg-white hover:text-slate-700 dark:hover:bg-slate-700 dark:hover:text-slate-200"
              >
                <X className="h-4 w-4" />
              </button>
            </span>
          </div>
          <div className="p-2">
            <MaterialViewer material={open} />
          </div>
        </div>
      )}
    </div>
  )
}
