import { describe, expect, it } from 'vitest'
import { toRichHtml } from '../src/lib/richText'

describe('toRichHtml', () => {
  it('turns older plain-text homework into paragraphs, keeping its line breaks', () => {
    expect(toRichHtml('5-mashq\n6-mashq\n\nLugʻat yodlash')).toBe('<p>5-mashq<br>6-mashq</p><p>Lugʻat yodlash</p>')
  })

  it('escapes plain text rather than treating it as markup', () => {
    expect(toRichHtml('a < b & <script>x</script>')).toBe('<p>a &lt; b &amp; &lt;script&gt;x&lt;/script&gt;</p>')
  })

  it("passes the editor's own HTML through", () => {
    const html = '<p>Qoida</p><table><tbody><tr><th><p>Soʻz</p></th></tr></tbody></table>'
    expect(toRichHtml(html)).toBe(html)
  })

  it('is empty for nothing written', () => {
    expect(toRichHtml(null)).toBe('')
    expect(toRichHtml('')).toBe('')
  })
})
