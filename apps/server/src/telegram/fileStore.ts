import { GrammyError, InputFile, type Api } from 'grammy'
import type { PhotoSize } from 'grammy/types'
import type { StoredPhoto, StoredVideo, StoredVoice } from '@tashkurgan/domain'
import { AppError } from '@tashkurgan/shared'

/**
 * Where homework photos and voice notes live: on Telegram's servers, not ours. The database keeps
 * only each file's Telegram file id, so they cost the server no disk space; they are fetched back
 * through the Bot API when someone looks at (or listens to) them.
 *
 * With `storageChatId` set (a private channel the bot posts in), every file is also posted
 * there -- a durable copy that survives a family deleting their chat with the bot, and a place
 * to browse submissions by hand. Without it, Mini App uploads land in the uploader's own chat.
 */
export type HomeworkFileStore = {
  /**
   * Puts an uploaded photo on Telegram: in the storage chat, else in `ownerChatId` (the uploader's
   * own chat with the bot). With neither -- a teacher's upload without a storage chat -- it fails.
   */
  upload(photo: Buffer, options: { ownerChatId?: string; caption: string }): Promise<StoredPhoto>
  /**
   * Keeps a photo someone already sent the bot -- copied to the storage chat when there is one.
   * `kind` is how it was sent: as a photo, or as an image file (uncompressed).
   */
  keep(photo: StoredPhoto, caption: string, kind: 'photo' | 'document'): Promise<StoredPhoto>
  /**
   * Keeps a voice note (or audio file) someone sent the bot -- copied to the storage chat when
   * there is one, the same way as `keep`.
   */
  keepVoice(voice: StoredVoice, caption: string, kind: 'voice' | 'audio'): Promise<StoredVoice>
  /**
   * Keeps a video someone sent the bot (a round video message, or a regular video) -- copied to
   * the storage chat when there is one, the same way as `keep`.
   */
  keepVideo(video: StoredVideo, caption: string): Promise<StoredVideo>
  /** The file's bytes again (an image, a voice note or a video). */
  download(fileId: string): Promise<{ body: Buffer; contentType: string }>
}

/** The biggest file the Bot API will download -- anything larger couldn't be played back. */
export const MAX_DOWNLOAD_BYTES = 20 * 1024 * 1024

/** The biggest size Telegram made of a photo -- the one worth keeping. */
export function largestPhoto(sizes: PhotoSize[]): StoredPhoto {
  const best = sizes.reduce((a, b) => (b.width * b.height > a.width * a.height ? b : a))
  return { fileId: best.file_id, fileUniqueId: best.file_unique_id, width: best.width, height: best.height, size: best.file_size ?? null }
}

const CONTENT_TYPES: Record<string, string> = {
  jpg: 'image/jpeg',
  jpeg: 'image/jpeg',
  png: 'image/png',
  webp: 'image/webp',
  // Telegram voice notes are Opus in an Ogg container, saved as .oga.
  oga: 'audio/ogg',
  ogg: 'audio/ogg',
  opus: 'audio/ogg',
  mp3: 'audio/mpeg',
  m4a: 'audio/mp4',
  wav: 'audio/wav',
  // Round video messages are always MP4; regular videos nearly always are.
  mp4: 'video/mp4',
  mov: 'video/quicktime',
  webm: 'video/webm',
}

/** Recently viewed photos, so a teacher flipping back and forth doesn't refetch from Telegram. */
class ByteCache {
  private entries = new Map<string, { body: Buffer; contentType: string }>()
  private bytes = 0

  constructor(private readonly maxBytes: number) {}

  get(key: string) {
    const hit = this.entries.get(key)
    if (hit) {
      this.entries.delete(key)
      this.entries.set(key, hit)
    }
    return hit
  }

  set(key: string, value: { body: Buffer; contentType: string }) {
    if (value.body.length > this.maxBytes) return
    this.entries.set(key, value)
    this.bytes += value.body.length
    for (const [oldKey, old] of this.entries) {
      if (this.bytes <= this.maxBytes) break
      this.entries.delete(oldKey)
      this.bytes -= old.body.length
    }
  }
}

/**
 * Telegram turning a request down (the bot isn't in the storage channel, a file id from another
 * bot) is a setup problem, not a crash -- answered as a 502 that says what Telegram said.
 */
async function askTelegram<T>(call: () => Promise<T>): Promise<T> {
  try {
    return await call()
  } catch (err) {
    if (err instanceof GrammyError) throw new AppError(`Telegram: ${err.description}`, 502)
    throw err
  }
}

export function telegramFileStore(api: Api, token: string, storageChatId?: string): HomeworkFileStore {
  const cache = new ByteCache(40 * 1024 * 1024)

  return {
    async upload(photo, { ownerChatId, caption }) {
      const chatId = storageChatId ?? ownerChatId
      if (!chatId) throw new AppError('Set TELEGRAM_STORAGE_CHAT_ID to upload images', 503)
      const message = await askTelegram(() =>
        api.sendPhoto(chatId, new InputFile(photo, 'homework.jpg'), { caption, disable_notification: true }),
      )
      return largestPhoto(message.photo)
    },

    async keep(photo, caption, kind) {
      if (!storageChatId) return photo
      const options = { caption, disable_notification: true }
      if (kind === 'photo') return largestPhoto((await api.sendPhoto(storageChatId, photo.fileId, options)).photo)
      const { document } = await api.sendDocument(storageChatId, photo.fileId, options)
      return document ? { ...photo, fileId: document.file_id, fileUniqueId: document.file_unique_id } : photo
    },

    async keepVoice(voice, caption, kind) {
      if (!storageChatId) return voice
      const options = { caption, disable_notification: true }
      const copy =
        kind === 'voice'
          ? (await api.sendVoice(storageChatId, voice.fileId, options)).voice
          : (await api.sendAudio(storageChatId, voice.fileId, options)).audio
      return { ...voice, fileId: copy.file_id, fileUniqueId: copy.file_unique_id }
    },

    async keepVideo(video, caption) {
      if (!storageChatId) return video
      if (!video.round) {
        const copy = (await api.sendVideo(storageChatId, video.fileId, { caption, disable_notification: true })).video
        return { ...video, fileId: copy.file_id, fileUniqueId: copy.file_unique_id }
      }
      // A round video message can't carry a caption, so whose it is goes in a reply to it.
      const message = await api.sendVideoNote(storageChatId, video.fileId, { disable_notification: true })
      await api.sendMessage(storageChatId, caption, { disable_notification: true, reply_parameters: { message_id: message.message_id } })
      return { ...video, fileId: message.video_note.file_id, fileUniqueId: message.video_note.file_unique_id }
    },

    async download(fileId) {
      const cached = cache.get(fileId)
      if (cached) return cached
      // Download links expire after an hour, so each one is asked for fresh.
      const file = await askTelegram(() => api.getFile(fileId))
      if (!file.file_path) throw new Error('Telegram returned no file path')
      const res = await fetch(`https://api.telegram.org/file/bot${token}/${file.file_path}`)
      if (!res.ok) throw new Error(`Telegram file download failed: ${res.status}`)
      const extension = file.file_path.split('.').pop()?.toLowerCase() ?? ''
      const result = { body: Buffer.from(await res.arrayBuffer()), contentType: CONTENT_TYPES[extension] ?? 'image/jpeg' }
      // A couple of videos would fill the cache and push out every photo; the browser keeps them instead.
      if (!result.contentType.startsWith('video/')) cache.set(fileId, result)
      return result
    },
  }
}

/** JPEG, PNG or WebP, by their first bytes -- what an upload must be. */
export function isSupportedImage(body: Buffer): boolean {
  if (body.length < 12) return false
  const jpeg = body[0] === 0xff && body[1] === 0xd8 && body[2] === 0xff
  const png = body.subarray(0, 8).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a, 0x1a, 0x0a]))
  const webp = body.subarray(0, 4).toString('ascii') === 'RIFF' && body.subarray(8, 12).toString('ascii') === 'WEBP'
  return jpeg || png || webp
}
