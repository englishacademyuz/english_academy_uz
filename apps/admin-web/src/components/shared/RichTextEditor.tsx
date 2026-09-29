import { useEffect, type ReactNode } from 'react'
import { EditorContent, useEditor, useEditorState, type Editor } from '@tiptap/react'
import StarterKit from '@tiptap/starter-kit'
import { TableKit } from '@tiptap/extension-table'
import { Placeholder } from '@tiptap/extensions'
import { BookA, Bold, Heading3, Italic, List, ListOrdered, Redo2, Table, Trash2, Underline, Undo2 } from 'lucide-react'
import { toRichHtml } from '../../lib/richText'

/**
 * A small rich-text editor for a lesson's explanation and homework: headings,
 * bold/italic, lists and tables (with a one-click vocabulary table). Its value
 * is HTML, or '' when nothing is written.
 */
export function RichTextEditor({
  value,
  onChange,
  placeholder,
}: {
  value: string
  onChange: (html: string) => void
  placeholder?: string
}) {
  const editor = useEditor({
    extensions: [
      StarterKit.configure({ heading: { levels: [3] }, link: { openOnClick: false } }),
      TableKit.configure({ table: { resizable: false } }),
      Placeholder.configure({ placeholder }),
    ],
    content: toRichHtml(value),
    editorProps: { attributes: { class: 'rich-text' } },
    onUpdate: ({ editor }) => onChange(editor.isEmpty ? '' : editor.getHTML()),
  })

  // The form swaps in another lesson's text (picking another date) -- follow it
  // without echoing the change back as an edit.
  useEffect(() => {
    if (!editor) return
    const current = editor.isEmpty ? '' : editor.getHTML()
    if (value !== current) editor.commands.setContent(toRichHtml(value), { emitUpdate: false })
  }, [editor, value])

  return (
    <div className="rich-editor overflow-hidden rounded-lg border border-slate-300 bg-white focus-within:border-brand-500 focus-within:ring-2 focus-within:ring-brand-100 dark:border-slate-700 dark:bg-slate-900 dark:focus-within:ring-brand-500/20">
      {editor && <Toolbar editor={editor} />}
      <EditorContent editor={editor} />
    </div>
  )
}

function Toolbar({ editor }: { editor: Editor }) {
  const state = useEditorState({
    editor,
    selector: ({ editor: e }) => ({
      bold: e.isActive('bold'),
      italic: e.isActive('italic'),
      underline: e.isActive('underline'),
      heading: e.isActive('heading', { level: 3 }),
      bullet: e.isActive('bulletList'),
      ordered: e.isActive('orderedList'),
      inTable: e.isActive('table'),
      canUndo: e.can().undo(),
      canRedo: e.can().redo(),
    }),
  })
  const run = () => editor.chain().focus()

  return (
    <div className="flex flex-wrap items-center gap-0.5 border-b border-slate-200 bg-slate-50 px-1.5 py-1 dark:border-slate-700 dark:bg-slate-800/60">
      <Tool label="Qalin" active={state.bold} onClick={() => run().toggleBold().run()}>
        <Bold className="h-4 w-4" />
      </Tool>
      <Tool label="Kursiv" active={state.italic} onClick={() => run().toggleItalic().run()}>
        <Italic className="h-4 w-4" />
      </Tool>
      <Tool label="Tagiga chizilgan" active={state.underline} onClick={() => run().toggleUnderline().run()}>
        <Underline className="h-4 w-4" />
      </Tool>
      <Tool label="Sarlavha" active={state.heading} onClick={() => run().toggleHeading({ level: 3 }).run()}>
        <Heading3 className="h-4 w-4" />
      </Tool>
      <Divider />
      <Tool label="Roʻyxat" active={state.bullet} onClick={() => run().toggleBulletList().run()}>
        <List className="h-4 w-4" />
      </Tool>
      <Tool label="Raqamli roʻyxat" active={state.ordered} onClick={() => run().toggleOrderedList().run()}>
        <ListOrdered className="h-4 w-4" />
      </Tool>
      <Divider />
      <Tool label="Jadval" onClick={() => run().insertTable({ rows: 3, cols: 3, withHeaderRow: true }).run()}>
        <Table className="h-4 w-4" />
      </Tool>
      <Tool
        label="Lugʻat jadvali"
        // Built cell by cell so the cursor ends up in the first empty word cell, ready to type.
        onClick={() =>
          run()
            .insertTable({ rows: 4, cols: 2, withHeaderRow: true })
            .insertContent('Soʻz')
            .goToNextCell()
            .insertContent('Tarjima')
            .goToNextCell()
            .run()
        }
        wide
      >
        <BookA className="h-4 w-4" />
        <span className="text-xs font-medium">Lugʻat</span>
      </Tool>
      {state.inTable && (
        <>
          <Divider />
          <Tool label="Qator qoʻshish" onClick={() => run().addRowAfter().run()} wide>
            <span className="text-xs font-medium">+ Qator</span>
          </Tool>
          <Tool label="Ustun qoʻshish" onClick={() => run().addColumnAfter().run()} wide>
            <span className="text-xs font-medium">+ Ustun</span>
          </Tool>
          <Tool label="Qatorni oʻchirish" onClick={() => run().deleteRow().run()} wide>
            <span className="text-xs font-medium">− Qator</span>
          </Tool>
          <Tool label="Ustunni oʻchirish" onClick={() => run().deleteColumn().run()} wide>
            <span className="text-xs font-medium">− Ustun</span>
          </Tool>
          <Tool label="Jadvalni oʻchirish" onClick={() => run().deleteTable().run()}>
            <Trash2 className="h-4 w-4 text-red-500" />
          </Tool>
        </>
      )}
      <span className="ml-auto flex">
        <Tool label="Bekor qilish" disabled={!state.canUndo} onClick={() => run().undo().run()}>
          <Undo2 className="h-4 w-4" />
        </Tool>
        <Tool label="Qaytarish" disabled={!state.canRedo} onClick={() => run().redo().run()}>
          <Redo2 className="h-4 w-4" />
        </Tool>
      </span>
    </div>
  )
}

function Tool({
  label,
  active = false,
  disabled = false,
  wide = false,
  onClick,
  children,
}: {
  label: string
  active?: boolean
  disabled?: boolean
  wide?: boolean
  onClick: () => void
  children: ReactNode
}) {
  return (
    <button
      type="button"
      title={label}
      aria-label={label}
      aria-pressed={active}
      disabled={disabled}
      // Keep the text selection: a mousedown on the toolbar would otherwise blur the editor first.
      onMouseDown={(e) => e.preventDefault()}
      onClick={onClick}
      className={`flex h-8 items-center justify-center gap-1 rounded-md ${wide ? 'px-2' : 'w-8'} transition-colors disabled:opacity-30 ${
        active
          ? 'bg-brand-100 text-brand-700 dark:bg-brand-500/20 dark:text-brand-300'
          : 'text-slate-600 hover:bg-slate-200 dark:text-slate-300 dark:hover:bg-slate-700'
      }`}
    >
      {children}
    </button>
  )
}

const Divider = () => <span className="mx-1 h-5 w-px bg-slate-200 dark:bg-slate-700" />
