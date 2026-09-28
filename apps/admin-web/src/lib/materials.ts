export function parseHttpUrl(value: string): URL | null {
  try {
    const url = new URL(value.trim())
    return /^https?:$/.test(url.protocol) ? url : null
  } catch {
    return null
  }
}

const hostOf = (url: URL) => url.hostname.replace(/^www\.|^m\./, '')

/** YouTube/Vimeo page URL → embeddable player URL. */
export function videoEmbedUrl(url: URL): string | null {
  const host = hostOf(url)
  if (host === 'youtu.be') {
    const id = url.pathname.slice(1)
    return id ? `https://www.youtube.com/embed/${id}` : null
  }
  if (host === 'youtube.com' || host === 'youtube-nocookie.com') {
    const v = url.searchParams.get('v')
    if (v) return `https://www.youtube.com/embed/${v}`
    const match = url.pathname.match(/^\/(?:embed|shorts|live)\/([^/?]+)/)
    return match ? `https://www.youtube.com/embed/${match[1]}` : null
  }
  if (host === 'vimeo.com') {
    const match = url.pathname.match(/^\/(\d+)/)
    return match ? `https://player.vimeo.com/video/${match[1]}` : null
  }
  if (host === 'player.vimeo.com') return url.href
  return null
}

const YOUTUBE_HOSTS = ['youtu.be', 'youtube.com', 'youtube-nocookie.com']

export function isYoutubeUrl(value: string): boolean {
  const url = parseHttpUrl(value)
  return !!url && YOUTUBE_HOSTS.includes(hostOf(url)) && videoEmbedUrl(url) !== null
}

/**
 * Google Docs/Sheets/Slides/Drive share link → its read-only preview URL,
 * which (unlike /edit or /view) is allowed inside an iframe.
 */
export function docEmbedUrl(url: URL): string | null {
  const host = hostOf(url)
  if (host === 'docs.google.com') {
    const match = url.pathname.match(/^\/(document|spreadsheets|presentation)\/d\/([^/]+)/)
    return match ? `https://docs.google.com/${match[1]}/d/${match[2]}/preview` : null
  }
  if (host === 'drive.google.com') {
    const match = url.pathname.match(/^\/file\/d\/([^/]+)/)
    return match ? `https://drive.google.com/file/d/${match[1]}/preview` : null
  }
  return null
}

/** The video id of a YouTube link -- for its thumbnail. */
export function youtubeId(value: string): string | null {
  const url = parseHttpUrl(value)
  if (!url || !YOUTUBE_HOSTS.includes(hostOf(url))) return null
  const embed = videoEmbedUrl(url)
  return embed ? embed.split('/embed/')[1]?.split(/[?&]/)[0] ?? null : null
}

export type DocKind = 'document' | 'spreadsheet' | 'presentation' | 'drive' | 'other'

/** Which kind of Google file a link points to -- picks the tile's icon and color. */
export function docKind(value: string): DocKind {
  const url = parseHttpUrl(value)
  if (!url) return 'other'
  const host = hostOf(url)
  if (host === 'docs.google.com') {
    const kind = url.pathname.split('/')[1]
    if (kind === 'document' || kind === 'spreadsheets' || kind === 'presentation') {
      return kind === 'spreadsheets' ? 'spreadsheet' : kind
    }
  }
  if (host === 'drive.google.com') return 'drive'
  return 'other'
}
