import { sanitizeRichText } from '../../lib/richText'

/** Renders an explanation or homework written in the editor -- sanitized, with its lists and tables styled. */
export function RichText({ value, variant = 'admin', className = '' }: { value: string; variant?: 'admin' | 'tg'; className?: string }) {
  return (
    <div
      className={`rich-text ${variant === 'tg' ? 'rich-text-tg' : ''} ${className}`}
      // sanitizeRichText strips everything but formatting, lists, tables and links.
      dangerouslySetInnerHTML={{ __html: sanitizeRichText(value) }}
    />
  )
}
