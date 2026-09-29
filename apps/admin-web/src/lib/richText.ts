import DOMPurify from 'dompurify'

/**
 * A lesson's explanation and homework are stored as the editor's HTML. Older
 * ones are plain text, so everything reading them goes through here: plain
 * text becomes paragraphs, and HTML is sanitized before it's ever rendered --
 * it's typed by staff but shown to students and parents.
 */

const ALLOWED_TAGS = [
  'p', 'br', 'strong', 'b', 'em', 'i', 'u', 's', 'h3', 'h4', 'ul', 'ol', 'li', 'blockquote', 'a',
  'table', 'thead', 'tbody', 'tr', 'th', 'td', 'colgroup', 'col',
]
const ALLOWED_ATTR = ['href', 'target', 'rel', 'colspan', 'rowspan', 'colwidth']

const escapeHtml = (text: string) =>
  text.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')

const looksLikeHtml = (value: string) => /^\s*<(p|h\d|ul|ol|table|blockquote|div)[\s>]/i.test(value)

/** Editor-ready HTML for a stored value, whether it was saved by the editor or is older plain text. */
export function toRichHtml(value: string | null | undefined): string {
  if (!value) return ''
  if (looksLikeHtml(value)) return value
  return value
    .split(/\n{2,}/)
    .map((block) => `<p>${escapeHtml(block).replace(/\n/g, '<br>')}</p>`)
    .join('')
}

/** Safe HTML to render: only formatting, lists, tables and links survive, and links open in a new tab. */
export function sanitizeRichText(value: string | null | undefined): string {
  const clean = DOMPurify.sanitize(toRichHtml(value), { ALLOWED_TAGS, ALLOWED_ATTR })
  return clean.replace(/<a /g, '<a target="_blank" rel="noopener noreferrer" ')
}

/** The words alone -- for one-line previews (a homework card) where formatting can't fit. */
export function richTextToPlain(value: string | null | undefined): string {
  const html = sanitizeRichText(value)
  if (!html) return ''
  const doc = new DOMParser().parseFromString(html, 'text/html')
  // Keep block and cell boundaries as spaces so "so'z</td><td>tarjima" doesn't run together.
  doc.querySelectorAll('p, li, h3, h4, tr, blockquote, td, th').forEach((el) => el.append(' '))
  return (doc.body.textContent ?? '').replace(/\s+/g, ' ').trim()
}

/** An editor left blank still yields "<p></p>" -- count it as nothing written. */
export function isRichTextEmpty(value: string | null | undefined): boolean {
  if (!value) return true
  return !/<table/i.test(value) && richTextToPlain(value) === ''
}
