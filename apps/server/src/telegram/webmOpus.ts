/**
 * Browsers record a voice in the microphone as WebM (Chrome, Edge) -- but Telegram only makes a
 * voice note, the kind with a waveform and a play button, of Ogg. Both hold the same Opus audio,
 * so the packets are just moved from one container to the other: nothing is re-encoded.
 */

const EBML = 0x1a45dfa3
const SEGMENT = 0x18538067
const TRACKS = 0x1654ae6b
const TRACK_ENTRY = 0xae
const TRACK_NUMBER = 0xd7
const CODEC_ID = 0x86
const CODEC_PRIVATE = 0x63a2
const AUDIO = 0xe1
const CHANNELS = 0x9f
const CLUSTER = 0x1f43b675
const BLOCK_GROUP = 0xa0
const BLOCK = 0xa1
const SIMPLE_BLOCK = 0xa3

/** Elements whose children are read in place -- their size may be "unknown" while recording, so it is never trusted. */
const CONTAINERS = new Set([SEGMENT, TRACKS, TRACK_ENTRY, AUDIO, CLUSTER, BLOCK_GROUP])

/** True for the first bytes of a WebM (Matroska) file. */
export function isWebm(body: Buffer): boolean {
  return body.length >= 4 && body.readUInt32BE(0) === EBML
}

/** A variable-length integer: its length is marked by the first byte's leading zeros. */
function readVint(
  buf: Buffer,
  pos: number,
  keepMarker: boolean,
): { value: number; length: number; unknown: boolean } {
  const first = buf[pos]
  if (first === undefined || first === 0) throw new Error('Bad WebM')
  let length = 1
  while (!(first & (0x80 >> (length - 1)))) length++
  let value = keepMarker ? first : first & (0xff >> length)
  let allOnes = value === 0xff >> length
  for (let i = 1; i < length; i++) {
    const byte = buf[pos + i]
    if (byte === undefined) throw new Error('Bad WebM')
    value = value * 256 + byte
    if (byte !== 0xff) allOnes = false
  }
  return { value, length, unknown: !keepMarker && allOnes }
}

function readUint(buf: Buffer): number {
  let value = 0
  for (const byte of buf) value = value * 256 + byte
  return value
}

type OpusTrack = { number: number; codec: string; codecPrivate: Buffer | null; channels: number }

/** The Opus audio of a WebM recording: its header (when the file has one) and its packets in order. */
export function readWebmOpus(webm: Buffer): {
  head: Buffer | null
  channels: number
  packets: Buffer[]
} {
  const tracks: OpusTrack[] = []
  let track: OpusTrack | null = null
  const blocks: Array<{ track: number; data: Buffer }> = []

  let pos = 0
  while (pos < webm.length) {
    const id = readVint(webm, pos, true)
    const size = readVint(webm, pos + id.length, false)
    const start = pos + id.length + size.length
    if (CONTAINERS.has(id.value)) {
      if (id.value === TRACK_ENTRY)
        tracks.push((track = { number: 0, codec: '', codecPrivate: null, channels: 1 }))
      pos = start
      continue
    }
    // A recording cut short ends mid-element -- what came before it still plays.
    if (size.unknown || start + size.value > webm.length) break
    const data = webm.subarray(start, start + size.value)
    pos = start + size.value

    if (id.value === TRACK_NUMBER && track) track.number = readUint(data)
    else if (id.value === CODEC_ID && track) track.codec = data.toString('ascii')
    else if (id.value === CODEC_PRIVATE && track) track.codecPrivate = Buffer.from(data)
    else if (id.value === CHANNELS && track) track.channels = readUint(data)
    else if (id.value === SIMPLE_BLOCK || id.value === BLOCK) {
      const number = readVint(data, 0, false)
      const flags = data[number.length + 2]
      // Laced blocks pack several frames together; MediaRecorder never writes them for audio.
      if (flags & 0x06) throw new Error('Laced WebM blocks are not supported')
      blocks.push({ track: number.value, data: data.subarray(number.length + 3) })
    }
  }

  const opus = tracks.find((t) => t.codec === 'A_OPUS')
  if (!opus) throw new Error('No Opus audio in the WebM')
  return {
    head:
      opus.codecPrivate && opus.codecPrivate.subarray(0, 8).toString('ascii') === 'OpusHead'
        ? opus.codecPrivate
        : null,
    channels: opus.channels,
    packets: blocks.filter((b) => b.track === opus.number).map((b) => Buffer.from(b.data)),
  }
}

/** How many 48 kHz samples one Opus packet holds -- from its first byte (RFC 6716, section 3.1). */
export function opusPacketSamples(packet: Buffer): number {
  if (packet.length === 0) return 0
  const toc = packet[0]
  const config = toc >> 3
  // Frame length in units of 2.5 ms.
  const frameUnits =
    config < 12
      ? [4, 8, 16, 24][config & 3]
      : config < 16
        ? [4, 8][config & 1]
        : [1, 2, 4, 8][config & 3]
  const code = toc & 3
  const frames = code === 0 ? 1 : code < 3 ? 2 : (packet[1] ?? 0) & 0x3f
  return frames * frameUnits * 120
}

const CRC_TABLE = (() => {
  const table = new Uint32Array(256)
  for (let i = 0; i < 256; i++) {
    let r = i << 24
    for (let j = 0; j < 8; j++) r = r & 0x80000000 ? (r << 1) ^ 0x04c11db7 : r << 1
    table[i] = r >>> 0
  }
  return table
})()

function oggCrc(page: Buffer): number {
  let crc = 0
  for (const byte of page) crc = ((crc << 8) ^ CRC_TABLE[((crc >>> 24) ^ byte) & 0xff]) >>> 0
  return crc
}

/** One Ogg page carrying whole packets, its granule position the samples played by its end. */
function oggPage(
  packets: Buffer[],
  granule: number,
  serial: number,
  sequence: number,
  flags: number,
): Buffer {
  const lacing: number[] = []
  for (const packet of packets) {
    for (let left = packet.length; ; left -= 255) {
      lacing.push(Math.min(left, 255))
      if (left < 255) break
    }
  }
  const header = Buffer.alloc(27 + lacing.length)
  header.write('OggS', 0, 'ascii')
  header[5] = flags
  header.writeBigUInt64LE(BigInt(granule), 6)
  header.writeUInt32LE(serial, 14)
  header.writeUInt32LE(sequence, 18)
  header[26] = lacing.length
  Buffer.from(lacing).copy(header, 27)
  const page = Buffer.concat([header, ...packets])
  page.writeUInt32LE(oggCrc(page), 22)
  return page
}

/** An OpusHead for a file that came without one: the encoder's usual 312-sample warm-up, 48 kHz. */
function defaultOpusHead(channels: number): Buffer {
  const head = Buffer.alloc(19)
  head.write('OpusHead', 0, 'ascii')
  head[8] = 1
  head[9] = channels
  head.writeUInt16LE(312, 10)
  head.writeUInt32LE(48000, 12)
  return head
}

/** A WebM/Opus recording as an Ogg/Opus file, and its length in whole seconds. */
export function webmOpusToOgg(webm: Buffer): { ogg: Buffer; duration: number } {
  const { head, channels, packets } = readWebmOpus(webm)
  if (packets.length === 0) throw new Error('The recording is empty')
  const opusHead = head ?? defaultOpusHead(channels)
  const vendor = Buffer.from('tashkurgan')
  const tags = Buffer.alloc(8 + 4 + vendor.length + 4)
  tags.write('OpusTags', 0, 'ascii')
  tags.writeUInt32LE(vendor.length, 8)
  vendor.copy(tags, 12)

  const serial = 0x7a5b2c1d
  const pages = [oggPage([opusHead], 0, serial, 0, 0x02), oggPage([tags], 0, serial, 1, 0)]
  let granule = 0
  let batch: Buffer[] = []
  let segments = 0
  // Pages of about a second (50 packets of 20 ms), well under Ogg's 255 segments a page.
  const flush = (last: boolean) => {
    pages.push(oggPage(batch, granule, serial, pages.length, last ? 0x04 : 0))
    batch = []
    segments = 0
  }
  packets.forEach((packet, i) => {
    const needed = Math.floor(packet.length / 255) + 1
    if (segments + needed > 255) flush(false)
    batch.push(packet)
    segments += needed
    granule += opusPacketSamples(packet)
    if (batch.length === 50 || i === packets.length - 1) flush(i === packets.length - 1)
  })

  const preSkip = opusHead.readUInt16LE(10)
  return {
    ogg: Buffer.concat(pages),
    duration: Math.max(1, Math.round((granule - preSkip) / 48000)),
  }
}
