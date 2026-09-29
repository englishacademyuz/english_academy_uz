import { useState } from 'react'
import { FileText, Play, Plus, Trash2 } from 'lucide-react'
import type { LucideIcon } from 'lucide-react'
import { isYoutubeUrl, parseHttpUrl } from '../../lib/materials'
import type { LessonMaterialType } from '../../lib/types'
import { Button, Input } from '../ui'
import { MaterialChip } from './MaterialPreview'

export type MaterialDraft = { type: LessonMaterialType; content: string }

// Teachers add only these two kinds for now -- as many of each as they like.
const MATERIAL_OPTIONS: Array<{ type: LessonMaterialType; label: string; placeholder: string; icon: LucideIcon; tile: string }> = [
  { type: 'VIDEO', label: 'YouTube', placeholder: 'https://www.youtube.com/watch?v=…', icon: Play, tile: 'from-red-500 to-red-600' },
  { type: 'DOCUMENT', label: 'Hujjat', placeholder: 'https://docs.google.com/document/d/…', icon: FileText, tile: 'from-blue-500 to-blue-600' },
]

function materialError(draft: MaterialDraft): string | null {
  if (draft.type === 'VIDEO' && !isYoutubeUrl(draft.content)) return 'YouTube video havolasini kiriting'
  if (draft.type === 'DOCUMENT' && !parseHttpUrl(draft.content)) return 'Hujjat havolasini kiriting (https://…)'
  return null
}

/** Add/remove a lesson's sources -- shared by the lesson form and the past-lessons list. */
export function MaterialsEditor({
  value,
  onChange,
}: {
  value: MaterialDraft[]
  onChange: (materials: MaterialDraft[]) => void
}) {
  const [draft, setDraft] = useState<MaterialDraft>({ type: 'VIDEO', content: '' })
  const [error, setError] = useState<string | null>(null)

  function add() {
    if (!draft.content.trim()) return
    const problem = materialError(draft)
    setError(problem)
    if (problem) return
    onChange([...value, { ...draft, content: draft.content.trim() }])
    setDraft((d) => ({ ...d, content: '' }))
  }

  return (
    <div>
      <div role="radiogroup" aria-label="Material turi" className="mb-2 flex gap-2">
        {MATERIAL_OPTIONS.map((option) => {
          const active = draft.type === option.type
          const Icon = option.icon
          return (
            <button
              key={option.type}
              type="button"
              role="radio"
              aria-checked={active}
              onClick={() => {
                setDraft((d) => ({ ...d, type: option.type }))
                setError(null)
              }}
              className={`flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-colors ${
                active
                  ? 'bg-brand-50 text-brand-700 ring-2 ring-inset ring-brand-500 dark:bg-brand-500/10 dark:text-brand-300 dark:ring-brand-400'
                  : 'text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
              }`}
            >
              <span className={`flex h-5 w-5 items-center justify-center rounded bg-gradient-to-br text-white ${option.tile}`}>
                <Icon className={`h-3 w-3 ${option.type === 'VIDEO' ? 'fill-current' : ''}`} />
              </span>
              {option.label}
            </button>
          )
        })}
      </div>
      <div className="mb-2 flex gap-2">
        <Input
          value={draft.content}
          onChange={(e) => {
            setDraft((d) => ({ ...d, content: e.target.value }))
            setError(null)
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter') {
              e.preventDefault()
              add()
            }
          }}
          placeholder={MATERIAL_OPTIONS.find((o) => o.type === draft.type)?.placeholder}
        />
        <Button type="button" variant="secondary" onClick={add}>
          <Plus className="h-4 w-4" />
        </Button>
      </div>
      {error && <p className="mb-2 text-xs text-red-600 dark:text-red-400">{error}</p>}
      {value.length > 0 && (
        <ul className="grid gap-1.5 sm:grid-cols-2">
          {value.map((m, i) => (
            <li
              key={i}
              className="flex items-center justify-between gap-2 rounded-lg bg-slate-50 px-2 py-1.5 text-sm dark:bg-slate-800/60"
            >
              <MaterialChip material={m} index={i} />
              <button
                type="button"
                title="Oʻchirish"
                onClick={() => onChange(value.filter((_, idx) => idx !== i))}
                className="text-slate-400 hover:text-red-600 dark:text-slate-500 dark:hover:text-red-400"
              >
                <Trash2 className="h-4 w-4" />
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  )
}
