import { prisma } from '@tashkurgan/db'

/**
 * Hand-picked, clearly distinct hues -- the same list (in the same order) the
 * migration used to backfill existing levels. Once all are taken, a new color
 * is generated in the widest gap left on the color wheel.
 */
export const LEVEL_PALETTE = [
  '#6366f1', '#10b981', '#f59e0b', '#f43f5e', '#0ea5e9', '#8b5cf6',
  '#14b8a6', '#d946ef', '#f97316', '#84cc16', '#06b6d4', '#ec4899',
]

function hueOf(hex: string): number {
  const n = parseInt(hex.slice(1), 16)
  const r = ((n >> 16) & 255) / 255
  const g = ((n >> 8) & 255) / 255
  const b = (n & 255) / 255
  const max = Math.max(r, g, b)
  const d = max - Math.min(r, g, b)
  if (d === 0) return 0
  const h = max === r ? ((g - b) / d) % 6 : max === g ? (b - r) / d + 2 : (r - g) / d + 4
  return (h * 60 + 360) % 360
}

function hslToHex(h: number, s: number, l: number): string {
  const a = s * Math.min(l, 1 - l)
  const channel = (n: number) => {
    const k = (n + h / 30) % 12
    const c = l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1))
    return Math.round(c * 255).toString(16).padStart(2, '0')
  }
  return `#${channel(0)}${channel(8)}${channel(4)}`
}

/** A color no level in `used` has: a random free palette entry, else the middle of the widest hue gap. */
export function pickLevelColor(used: string[], random: () => number = Math.random): string {
  const taken = new Set(used.map((c) => c.toLowerCase()))
  const free = LEVEL_PALETTE.filter((c) => !taken.has(c))
  if (free.length > 0) return free[Math.floor(random() * free.length)]

  const hues = [...taken].map(hueOf).sort((a, b) => a - b)
  let bestHue = 0
  let bestGap = -1
  hues.forEach((hue, i) => {
    const next = i === hues.length - 1 ? hues[0] + 360 : hues[i + 1]
    if (next - hue > bestGap) {
      bestGap = next - hue
      bestHue = (hue + (next - hue) / 2) % 360
    }
  })
  // Vary lightness a little so hues that end up close still read apart.
  const lightness = 0.45 + random() * 0.1
  return hslToHex(bestHue, 0.7, lightness)
}

export async function createLevel(courseId: string, name: string) {
  const levels = await prisma.level.findMany({ select: { color: true } })
  return prisma.level.create({ data: { courseId, name, color: pickLevelColor(levels.map((l) => l.color)) } })
}
