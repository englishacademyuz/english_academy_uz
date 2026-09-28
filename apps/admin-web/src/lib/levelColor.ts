import type { CSSProperties } from 'react'

/** Used when a level's color isn't loaded (e.g. an archived group's partial payload). */
export const FALLBACK_LEVEL_COLOR = '#64748b'

/** `#rrggbb` + an alpha channel -- the palette colors are mid-tones, so tints read in both themes. */
export function tint(hex: string, alpha: number): string {
  return `${hex}${Math.round(alpha * 255).toString(16).padStart(2, '0')}`
}

/**
 * Every way the UI paints something in a level's color. Colors are data (one
 * per level, picked server-side), so they're applied as inline styles rather
 * than Tailwind classes.
 */
export function levelStyles(color: string | null | undefined) {
  const hex = color ?? FALLBACK_LEVEL_COLOR
  return {
    hex,
    /** A solid block with white text -- active weekday squares, avatars. */
    solid: { backgroundColor: hex, color: '#fff' } satisfies CSSProperties,
    /** A light tinted surface with colored text and a hairline ring -- badges, chips. */
    soft: {
      backgroundColor: tint(hex, 0.12),
      color: hex,
      boxShadow: `inset 0 0 0 1px ${tint(hex, 0.28)}`,
    } satisfies CSSProperties,
    /** Just the color -- top bars, dots, left borders. */
    fill: { backgroundColor: hex } satisfies CSSProperties,
    text: { color: hex } satisfies CSSProperties,
  }
}
