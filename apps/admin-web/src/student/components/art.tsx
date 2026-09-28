import type { SVGProps } from 'react'
import { GRADE, type Grade } from '../format'

/**
 * The Mini App's drawings, taken as-is from the design (inline SVG, so they
 * stay crisp at any size and need no image requests).
 */

type IconProps = SVGProps<SVGSVGElement> & { size?: number }

function Line({ size = 24, children, strokeWidth = 2.2, ...rest }: IconProps) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      stroke="currentColor"
      strokeWidth={strokeWidth}
      strokeLinecap="round"
      strokeLinejoin="round"
      aria-hidden
      {...rest}
    >
      {children}
    </svg>
  )
}

export const HomeIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M3 11l9-7 9 7" />
    <path d="M5 10v10h14V10" />
    <path d="M10 20v-6h4v6" />
  </Line>
)

export const BookIcon = (p: IconProps) => (
  <Line {...p}>
    <path d="M2 5h7a3 3 0 0 1 3 3v12a2 2 0 0 0-2-2H2z" />
    <path d="M22 5h-7a3 3 0 0 0-3 3v12a2 2 0 0 1 2-2h8z" />
  </Line>
)

export const CalendarIcon = (p: IconProps) => (
  <Line {...p}>
    <rect x="3" y="5" width="18" height="16" rx="3" />
    <path d="M3 10h18M8 3v4M16 3v4" />
  </Line>
)

export const UserIcon = (p: IconProps) => (
  <Line {...p}>
    <circle cx="12" cy="8" r="4" />
    <path d="M4 21c1-4 4-6 8-6s7 2 8 6" />
  </Line>
)

export const ClockIcon = (p: IconProps) => (
  <Line strokeWidth={2} {...p}>
    <circle cx="12" cy="12" r="9" />
    <path d="M12 7v5l3 2" />
  </Line>
)

export const GroupIcon = (p: IconProps) => (
  <Line strokeWidth={2} {...p}>
    <circle cx="9" cy="8" r="3" />
    <circle cx="17" cy="9" r="2.5" />
    <path d="M3 20c.8-3.5 3-5 6-5s5.2 1.5 6 5M15 15c3 0 5 1.5 6 4.5" />
  </Line>
)

export const LockIcon = (p: IconProps) => (
  <Line strokeWidth={2} {...p}>
    <rect x="4" y="10" width="16" height="11" rx="2" />
    <path d="M8 10V7a4 4 0 0 1 8 0v3" />
  </Line>
)

export const CheckIcon = (p: IconProps) => (
  <Line strokeWidth={3} {...p}>
    <path d="M5 12l5 5 9-10" />
  </Line>
)

export const PlayIcon = ({ size = 24, ...rest }: IconProps) => (
  <svg width={size} height={size} viewBox="0 0 24 24" fill="currentColor" aria-hidden {...rest}>
    <polygon points="8,5 19,12 8,19" />
  </svg>
)

export const DocIcon = (p: IconProps) => (
  <Line strokeWidth={2} {...p}>
    <path d="M6 3h8l4 4v14H6z" />
    <path d="M14 3v4h4M9 13h6M9 17h6" />
  </Line>
)

/** The cup on the points card; `cupFill` paints its bowl. */
export function TrophyIcon({ cupFill = 'none', ...p }: IconProps & { cupFill?: string }) {
  return (
    <Line strokeWidth={1.8} {...p}>
      <path d="M8 4h8v5a4 4 0 0 1-8 0z" fill={cupFill} />
      <path d="M8 6H5a3 3 0 0 0 3 4M16 6h3a3 3 0 0 1-3 4" />
      <path d="M12 13v4M8 21h8M9 17h6" />
    </Line>
  )
}

/** Small house-on-a-tile -- the homework card on the home screen. */
export function HomeworkTile({ size = 96 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 96 96" fill="none" aria-hidden className="shrink-0">
      <rect x="4" y="4" width="88" height="88" rx="24" fill="#FFD43B" />
      <path d="M20 46 48 22l28 24" stroke="#1F2A44" strokeWidth="5" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M27 42v30h42V42" fill="#fff" stroke="#1F2A44" strokeWidth="5" strokeLinejoin="round" />
      <rect x="41" y="52" width="14" height="20" rx="3" fill="#FF8787" stroke="#1F2A44" strokeWidth="4" />
      <circle cx="48" cy="36" r="5" fill="#74C0FC" stroke="#1F2A44" strokeWidth="3" />
    </svg>
  )
}

/** The big house with a sun -- heads the homework section of a lesson. */
export function HomeworkScene() {
  return (
    <svg width="150" height="130" viewBox="0 0 150 130" fill="none" aria-hidden>
      <circle cx="120" cy="24" r="14" fill="#FFD43B" stroke="#1F2A44" strokeWidth="4" />
      <path d="M18 64 75 16l57 48" stroke="#1F2A44" strokeWidth="7" strokeLinecap="round" strokeLinejoin="round" />
      <path d="M30 56v62h90V56" fill="#fff" stroke="#1F2A44" strokeWidth="7" strokeLinejoin="round" />
      <rect x="64" y="80" width="22" height="38" rx="4" fill="#FF8787" stroke="#1F2A44" strokeWidth="5" />
      <rect x="40" y="72" width="16" height="16" rx="3" fill="#74C0FC" stroke="#1F2A44" strokeWidth="4" />
      <rect x="94" y="72" width="16" height="16" rx="3" fill="#74C0FC" stroke="#1F2A44" strokeWidth="4" />
    </svg>
  )
}

const NEUTRAL_FACE = { face: '#DEE2E6', mouth: 'M8.5 15h7', mouthFill: 'none' }

/** A smiley whose face and mouth say the grade at a glance; `null` is a calm grey "no mark yet". */
export function GradeFace({ grade, size = 54 }: { grade: Grade | null; size?: number }) {
  const look = grade ? GRADE[grade] : NEUTRAL_FACE
  const filledMouth = look.mouthFill !== 'none'
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" aria-hidden className="shrink-0">
      <circle cx="12" cy="12" r="11" fill={look.face} />
      <circle cx="8.5" cy="9.5" r="1.4" fill="#1F2A44" />
      <circle cx="15.5" cy="9.5" r="1.4" fill="#1F2A44" />
      <path
        d={look.mouth}
        fill={look.mouthFill}
        stroke={filledMouth ? 'none' : '#1F2A44'}
        strokeWidth="1.7"
        strokeLinecap="round"
      />
    </svg>
  )
}
