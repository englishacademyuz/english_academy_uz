import { readFileSync } from 'node:fs'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { isWebm, opusPacketSamples, readWebmOpus, webmOpusToOgg } from '../src/telegram/webmOpus'

/** 1.2 seconds of a 440 Hz tone, recorded by Chrome's MediaRecorder as audio/webm;codecs=opus. */
const WEBM = readFileSync(join(__dirname, 'fixtures', 'voice.webm'))

/** The pages of an Ogg file: their granule positions and the packets they finish. */
function oggPages(ogg: Buffer) {
  const pages: Array<{ flags: number; granule: bigint; sequence: number; packets: number }> = []
  let pos = 0
  while (pos < ogg.length) {
    expect(ogg.subarray(pos, pos + 4).toString('ascii')).toBe('OggS')
    const segments = ogg[pos + 26]
    const lacing = [...ogg.subarray(pos + 27, pos + 27 + segments)]
    pages.push({
      flags: ogg[pos + 5],
      granule: ogg.readBigUInt64LE(pos + 6),
      sequence: ogg.readUInt32LE(pos + 18),
      packets: lacing.filter((l) => l < 255).length,
    })
    pos += 27 + segments + lacing.reduce((a, b) => a + b, 0)
  }
  expect(pos).toBe(ogg.length)
  return pages
}

describe('webmOpusToOgg', () => {
  it('reads the Opus packets out of a browser recording', () => {
    expect(isWebm(WEBM)).toBe(true)
    const { head, packets } = readWebmOpus(WEBM)
    expect(head?.subarray(0, 8).toString('ascii')).toBe('OpusHead')
    expect(packets.length).toBeGreaterThan(10)
  })

  it('moves them into an Ogg voice note of the same length', () => {
    const { packets } = readWebmOpus(WEBM)
    const { ogg, duration } = webmOpusToOgg(WEBM)
    expect(isWebm(ogg)).toBe(false)
    expect(duration).toBe(1)

    const pages = oggPages(ogg)
    expect(pages[0]).toMatchObject({ flags: 0x02, granule: 0n, packets: 1 })
    expect(ogg.subarray(28, 36).toString('ascii')).toBe('OpusHead')
    expect(pages[1]).toMatchObject({ flags: 0, granule: 0n, packets: 1 })
    expect(pages.at(-1)!.flags).toBe(0x04)
    expect(pages.map((p) => p.sequence)).toEqual(pages.map((_, i) => i))
    expect(pages.slice(2).reduce((n, p) => n + p.packets, 0)).toBe(packets.length)
    const samples = packets.reduce((n, p) => n + opusPacketSamples(p), 0)
    expect(pages.at(-1)!.granule).toBe(BigInt(samples))
  })

  it('counts samples by the packet header', () => {
    // CELT 20 ms, one frame; SILK 60 ms, one frame; CELT 10 ms, three frames (code 3).
    expect(opusPacketSamples(Buffer.from([0xf8]))).toBe(960)
    expect(opusPacketSamples(Buffer.from([0x18]))).toBe(2880)
    expect(opusPacketSamples(Buffer.from([0xf3, 0x03]))).toBe(1440)
  })

  it('turns down what is not WebM Opus', () => {
    expect(() => webmOpusToOgg(Buffer.from('OggS not webm at all'))).toThrow()
  })
})
