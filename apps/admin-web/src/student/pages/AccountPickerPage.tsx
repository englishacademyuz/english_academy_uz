import { haptic } from '../telegram'
import { initialsOf } from '../format'
import type { MiniAccounts } from '../types'

/** Each child gets their own color, so a parent finds theirs at a glance. */
const TILES = [
  'bg-tg-sun text-tg-ink',
  'bg-tg-blue text-white',
  'bg-tg-leaf text-white',
  'bg-tg-grape-2 text-white',
  'bg-tg-orange text-white',
]

/**
 * "Whose account?" -- the first screen on a phone siblings share, every time the app opens
 * (whichever bot button opened it; the screen it was meant for follows the choice). To switch,
 * the app is closed and opened again.
 */
export function AccountPickerPage({ accounts, onChoose }: { accounts: MiniAccounts['accounts']; onChoose: (id: string) => void }) {
  return (
    <div className="mx-auto flex min-h-screen max-w-lg flex-col justify-center gap-6 bg-tg-cream px-5 py-10 font-tg-body text-tg-ink">
      <div className="text-center">
        <p className="mx-auto flex h-20 w-20 items-center justify-center rounded-[26px] bg-tg-sun text-4xl" aria-hidden>
          👨‍👩‍👧‍👦
        </p>
        <h1 className="mt-4 font-tg-display text-[26px] font-semibold leading-tight">Kimning hisobiga kirasiz?</h1>
        <p className="mt-1.5 text-[15px] font-bold text-tg-muted">Farzandingiz ismini tanlang</p>
      </div>

      <ul className="flex flex-col gap-3">
        {accounts.map((account, i) => (
          <li key={account.id}>
            <button
              onClick={() => {
                haptic('tap')
                onChoose(account.id)
              }}
              className="flex w-full items-center gap-4 rounded-[26px] border-2 border-tg-line bg-white p-4 text-left transition-transform active:scale-[0.98]"
            >
              <span
                className={`flex h-16 w-16 shrink-0 items-center justify-center rounded-[20px] font-tg-display text-2xl font-semibold ${TILES[i % TILES.length]}`}
              >
                {initialsOf(account.firstName, account.lastName)}
              </span>
              <span className="min-w-0 flex-1">
                <span className="block truncate font-tg-display text-[22px] font-semibold leading-tight">
                  {account.firstName} {account.lastName}
                </span>
                <span className="mt-0.5 flex items-center gap-1.5 text-sm font-bold text-tg-muted">
                  {account.group ? (
                    <>
                      <span className="h-2.5 w-2.5 shrink-0 rounded-full" style={{ backgroundColor: account.group.levelColor }} />
                      <span className="truncate">{account.group.name}</span>
                    </>
                  ) : (
                    'Guruhsiz'
                  )}
                </span>
              </span>
              <span className="text-2xl text-tg-faint" aria-hidden>
                ›
              </span>
            </button>
          </li>
        ))}
      </ul>

      <p className="text-center text-[13px] font-bold leading-relaxed text-tg-faint">
        Boshqa farzandning hisobiga oʻtish uchun ilovani yopib, qaytadan oching.
      </p>
    </div>
  )
}
