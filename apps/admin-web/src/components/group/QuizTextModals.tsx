import { useMemo, useRef, useState } from 'react'
import { Copy } from 'lucide-react'
import { buildQuizPrompt, parseQuizText } from '../../lib/quizText'
import type { ParsedQuizQuestion } from '../../lib/quizText'
import { notifyError, notifySuccess } from '../../lib/toast'
import { Button, Field, Input, Modal, Textarea } from '../ui'

/** A ready-to-paste prompt for ChatGPT/Claude/Gemini whose answer `QuizImportModal` can read back. */
export function QuizPromptModal({ level, onClose }: { level?: string; onClose: () => void }) {
  const [topic, setTopic] = useState('')
  const [count, setCount] = useState('10')
  const previewRef = useRef<HTMLTextAreaElement>(null)
  const prompt = buildQuizPrompt({ count: Math.max(1, Number(count) || 10), level, topic })

  async function copy() {
    try {
      await navigator.clipboard.writeText(prompt)
    } catch {
      // The Clipboard API needs a secure context; fall back to the selection.
      previewRef.current?.select()
      if (!document.execCommand('copy')) return notifyError(null, 'Nusxa olib boʻlmadi — matnni qoʻlda belgilang')
    }
    notifySuccess('Nusxa olindi')
  }

  return (
    <Modal title="AI uchun prompt" onClose={onClose} size="lg">
      <div className="space-y-4">
        <div className="grid gap-4 sm:grid-cols-[1fr_9rem]">
          <Field label="Mavzu">
            <Input value={topic} onChange={(e) => setTopic(e.target.value)} placeholder="Present Simple" autoFocus />
          </Field>
          <Field label="Savollar soni">
            <Input type="number" min={1} max={50} step={1} value={count} onChange={(e) => setCount(e.target.value)} />
          </Field>
        </div>
        <Field label="Prompt">
          <Textarea ref={previewRef} readOnly value={prompt} rows={12} className="font-mono text-xs" />
        </Field>
        <p className="text-xs text-slate-500 dark:text-slate-400">
          Promptni ChatGPT, Claude yoki Gemini'ga yuboring, javobini esa “Matndan import qilish” orqali shu yerga qoʻying.
        </p>
        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Yopish
          </Button>
          <Button type="button" onClick={copy}>
            <Copy className="h-4 w-4" /> Nusxa olish
          </Button>
        </div>
      </div>
    </Modal>
  )
}

const PLACEHOLDER = `1. She ___ to school every day.
A) go
B) goes *
C) going
D) gone

2. ...`

/** Pasted AI output → questions, previewed live; nothing is saved until the teacher presses "Saqlash" in the editor. */
export function QuizImportModal({
  onImport,
  onClose,
}: {
  onImport: (questions: ParsedQuizQuestion[], mode: 'append' | 'replace') => void
  onClose: () => void
}) {
  const [text, setText] = useState('')
  const result = useMemo(() => parseQuizText(text), [text])
  const found = result.questions.length + result.errors.length
  const canImport = result.questions.length > 0

  return (
    <Modal title="Matndan import qilish" onClose={onClose} size="lg">
      <div className="space-y-4">
        <Textarea
          value={text}
          onChange={(e) => setText(e.target.value)}
          placeholder={PLACEHOLDER}
          rows={12}
          autoFocus
          className="font-mono text-xs"
        />

        {text.trim() && (
          <div className="rounded-lg border border-slate-200 px-4 py-3 text-sm dark:border-slate-700">
            {found === 0 ? (
              <p className="text-slate-500 dark:text-slate-400">Savol topilmadi. Namunadagi formatni tekshiring.</p>
            ) : (
              <p className="font-medium text-slate-900 dark:text-slate-100">
                {found} ta savol topildi
                {result.errors.length > 0 && (
                  <span className="text-red-600 dark:text-red-400">, {result.errors.length} tasida xatolik bor</span>
                )}
              </p>
            )}
            {result.errors.length > 0 && (
              <>
                <ul className="mt-2 space-y-0.5 text-red-600 dark:text-red-400">
                  {result.errors.map((err, i) => (
                    <li key={i}>
                      {err.questionNumber}-savol: {err.message}
                    </li>
                  ))}
                </ul>
                <p className="mt-2 text-xs text-slate-500 dark:text-slate-400">
                  Xatolik bor savollar import qilinmaydi — matnni tuzating yoki keyin qoʻlda qoʻshing.
                </p>
              </>
            )}
          </div>
        )}

        <div className="flex justify-end gap-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="button" variant="secondary" disabled={!canImport} onClick={() => onImport(result.questions, 'replace')}>
            Almashtirish
          </Button>
          <Button type="button" disabled={!canImport} onClick={() => onImport(result.questions, 'append')}>
            Qoʻshish
          </Button>
        </div>
      </div>
    </Modal>
  )
}
