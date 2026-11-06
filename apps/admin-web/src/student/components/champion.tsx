import { useEffect, useRef, useState } from 'react'
import { addMonths, tashkentMonth } from '@tashkurgan/shared'
import { haptic } from '../telegram'
import { MONTHS, capitalize } from '../format'
import type { MiniChampionMonth } from '../types'

const monthName = (m: { month: number }) => MONTHS[m.month - 1]

/** "Ali V." or "Ali V. va Vali S." -- every winner of a tied month. */
const winnerNames = (month: MiniChampionMonth) => month.winners.map((w) => w.name).join(' va ')

const seenKey = (studentKey: string, m: MiniChampionMonth) => `umid:champion-seen:${studentKey}:${m.year}-${m.month}`

function wasSeen(key: string) {
  try {
    return window.localStorage.getItem(key) === '1'
  } catch {
    return false
  }
}

function markSeen(key: string) {
  try {
    window.localStorage.setItem(key, '1')
  } catch {
    // Private mode or blocked storage -- it simply shows again next time.
  }
}

/**
 * Last month's champions, celebrated the first time the student opens the app in the new month
 * (on the 1st for most) -- fireworks for the winner, the news for everyone else. Afterwards the
 * card on the home screen stays all month, and tapping it plays the celebration again.
 */
export function ChampionSpotlight({ champions, studentKey }: { champions: MiniChampionMonth[]; studentKey: string }) {
  const latest = champions[0]
  const last = addMonths(tashkentMonth(), -1)
  const isFresh = !!latest && latest.year === last.year && latest.month === last.month
  const key = latest ? seenKey(studentKey, latest) : ''
  const [open, setOpen] = useState(() => isFresh && !wasSeen(key))

  if (!isFresh) return null

  const close = () => {
    markSeen(key)
    setOpen(false)
  }

  return (
    <>
      <ChampionCard month={latest} older={champions.slice(1)} onOpen={() => setOpen(true)} />
      {open && <ChampionCelebration month={latest} onClose={close} />}
    </>
  )
}

function ChampionCard({ month, older, onOpen }: { month: MiniChampionMonth; older: MiniChampionMonth[]; onOpen: () => void }) {
  const mine = month.winners.some((w) => w.isMe)
  return (
    <section className="flex flex-col gap-2.5">
      <button
        onClick={onOpen}
        className={`flex items-center gap-4 rounded-[28px] p-[18px] text-left active:scale-[0.99] ${
          mine ? 'bg-tg-sun text-tg-ink' : 'border-[3px] border-tg-sun bg-tg-sun-soft'
        }`}
      >
        <span className="flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] bg-white text-4xl" aria-hidden>
          👑
        </span>
        <span className="flex min-w-0 grow flex-col gap-0.5">
          <span className="text-sm font-extrabold uppercase text-tg-sun-ink">{capitalize(monthName(month))} chempioni</span>
          <span className="font-tg-display text-[22px] font-semibold leading-tight">
            {mine ? 'Bu sensan! 🎉' : winnerNames(month)}
          </span>
          <span className="text-sm font-bold text-tg-sun-body">
            {month.winners[0].points} ball{mine && month.winners.length > 1 ? ` · ${winnerNames(month)}` : ''}
          </span>
        </span>
      </button>
      {older.length > 0 && (
        <div className="flex flex-wrap gap-1.5">
          {older.map((m) => (
            <span
              key={`${m.year}-${m.month}`}
              className={`rounded-full px-3 py-1 text-[13px] font-extrabold ${
                m.winners.some((w) => w.isMe) ? 'bg-tg-sun text-tg-ink' : 'bg-tg-sand text-tg-body'
              }`}
            >
              🏆 {capitalize(monthName(m))}: {winnerNames(m)}
            </span>
          ))}
        </div>
      )}
    </section>
  )
}

/** Full screen: fireworks behind, the champion's name in front. */
function ChampionCelebration({ month, onClose }: { month: MiniChampionMonth; onClose: () => void }) {
  const mine = month.winners.some((w) => w.isMe)
  const now = monthName(tashkentMonth())

  useEffect(() => {
    haptic('success')
  }, [])

  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-label={`${capitalize(monthName(month))} chempioni`}
      className="fixed inset-0 z-50 flex items-center justify-center bg-tg-ink/90 px-6"
      onClick={onClose}
    >
      <Fireworks intensity={mine ? 'high' : 'low'} />
      <div
        className="relative flex w-full max-w-sm flex-col items-center gap-3 rounded-[32px] bg-white px-6 pb-6 pt-8 text-center shadow-2xl"
        style={{ animation: 'champion-pop 600ms cubic-bezier(.2,1.4,.4,1) both' }}
        onClick={(e) => e.stopPropagation()}
      >
        <span className="text-7xl leading-none" style={{ animation: 'champion-bob 1.6s ease-in-out infinite' }} aria-hidden>
          {mine ? '🏆' : '👑'}
        </span>
        {mine ? (
          <>
            <span className="font-tg-display text-[34px] font-bold leading-tight text-tg-grape">Tabriklaymiz!</span>
            <span className="text-lg font-bold text-tg-body">
              Sen <b>{monthName(month)}</b> oyining chempionisan!
            </span>
            {month.winners.length > 1 && (
              <span className="text-sm font-bold text-tg-muted">Gʻoliblar: {winnerNames(month)}</span>
            )}
          </>
        ) : (
          <>
            <span className="text-sm font-extrabold uppercase text-tg-sun-ink">{capitalize(monthName(month))} oyi chempioni</span>
            <span className="font-tg-display text-[30px] font-bold leading-tight text-tg-ink">{winnerNames(month)}</span>
            <span className="text-base font-bold text-tg-body">{capitalize(now)}da chempion sen boʻlishing mumkin! 💪</span>
          </>
        )}
        <span className="rounded-full bg-tg-sun px-4 py-1 font-tg-display text-xl font-bold tabular-nums text-tg-ink">
          {month.winners[0].points} ball
        </span>
        <span className="text-[13px] font-bold text-tg-muted">Yangi oy — ballar 0 dan boshlanadi</span>
        <button
          onClick={onClose}
          className="mt-1 w-full rounded-2xl bg-tg-grape p-3.5 text-[17px] font-extrabold text-white active:scale-[0.99]"
        >
          {mine ? 'Rahmat! 🎉' : 'Zoʻr!'}
        </button>
      </div>
      <style>{`
        @keyframes champion-pop { from { transform: scale(.6); opacity: 0 } to { transform: scale(1); opacity: 1 } }
        @keyframes champion-bob { 0%,100% { transform: translateY(0) rotate(-4deg) } 50% { transform: translateY(-8px) rotate(4deg) } }
        @media (prefers-reduced-motion: reduce) { [style*="champion-"] { animation: none !important } }
      `}</style>
    </div>
  )
}

const COLORS = ['#FFD43B', '#FF6B6B', '#7048E8', '#3B5BDB', '#2F9E44', '#F08C00', '#FFFFFF']

type Spark = { x: number; y: number; vx: number; vy: number; life: number; color: string; size: number }
type Rocket = { x: number; y: number; vy: number; targetY: number; color: string }

/** Rockets that rise and burst into falling sparks, drawn on a canvas behind the dialog. */
function Fireworks({ intensity }: { intensity: 'high' | 'low' }) {
  const canvasRef = useRef<HTMLCanvasElement>(null)

  useEffect(() => {
    const canvas = canvasRef.current
    const ctx = canvas?.getContext('2d')
    if (!canvas || !ctx) return
    if (window.matchMedia?.('(prefers-reduced-motion: reduce)').matches) return

    const dpr = Math.min(window.devicePixelRatio || 1, 2)
    const resize = () => {
      canvas.width = window.innerWidth * dpr
      canvas.height = window.innerHeight * dpr
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0)
    }
    resize()
    window.addEventListener('resize', resize)

    const sparks: Spark[] = []
    const rockets: Rocket[] = []
    const pick = () => COLORS[Math.floor(Math.random() * COLORS.length)]
    const launchEvery = intensity === 'high' ? 420 : 900
    const sparksPerBurst = intensity === 'high' ? 70 : 45

    const launch = () => {
      const w = window.innerWidth
      const h = window.innerHeight
      rockets.push({ x: w * (0.15 + Math.random() * 0.7), y: h, vy: -(9 + Math.random() * 3), targetY: h * (0.12 + Math.random() * 0.3), color: pick() })
    }
    const burst = (x: number, y: number, color: string) => {
      for (let i = 0; i < sparksPerBurst; i++) {
        const angle = (Math.PI * 2 * i) / sparksPerBurst + Math.random() * 0.2
        const speed = 2 + Math.random() * 4
        sparks.push({
          x,
          y,
          vx: Math.cos(angle) * speed,
          vy: Math.sin(angle) * speed,
          life: 1,
          color: Math.random() < 0.7 ? color : pick(),
          size: 1.5 + Math.random() * 2,
        })
      }
    }

    let frame = 0
    let lastLaunch = 0
    const started = performance.now()
    // Keeps going for a while, then lets the last sparks fall out.
    const runFor = intensity === 'high' ? 9000 : 4500

    const tick = (t: number) => {
      ctx.clearRect(0, 0, window.innerWidth, window.innerHeight)
      if (t - started < runFor && t - lastLaunch > launchEvery) {
        launch()
        lastLaunch = t
      }

      for (let i = rockets.length - 1; i >= 0; i--) {
        const r = rockets[i]
        r.y += r.vy
        r.vy *= 0.985
        ctx.fillStyle = r.color
        ctx.beginPath()
        ctx.arc(r.x, r.y, 2.5, 0, Math.PI * 2)
        ctx.fill()
        if (r.y <= r.targetY || r.vy > -2) {
          burst(r.x, r.y, r.color)
          rockets.splice(i, 1)
        }
      }

      for (let i = sparks.length - 1; i >= 0; i--) {
        const s = sparks[i]
        s.x += s.vx
        s.y += s.vy
        s.vx *= 0.97
        s.vy = s.vy * 0.97 + 0.06
        s.life -= 0.012
        if (s.life <= 0) {
          sparks.splice(i, 1)
          continue
        }
        ctx.globalAlpha = s.life
        ctx.fillStyle = s.color
        ctx.beginPath()
        ctx.arc(s.x, s.y, s.size, 0, Math.PI * 2)
        ctx.fill()
      }
      ctx.globalAlpha = 1

      if (t - started < runFor || rockets.length > 0 || sparks.length > 0) frame = requestAnimationFrame(tick)
    }
    frame = requestAnimationFrame(tick)

    return () => {
      cancelAnimationFrame(frame)
      window.removeEventListener('resize', resize)
    }
  }, [intensity])

  return <canvas ref={canvasRef} className="pointer-events-none fixed inset-0 h-full w-full" aria-hidden />
}
