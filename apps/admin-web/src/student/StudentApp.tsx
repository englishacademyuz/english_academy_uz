import { useEffect } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { MiniApiError, miniApi } from './api'
import { initData, webApp } from './telegram'
import { BookIcon, CalendarIcon, HomeIcon, UserIcon } from './components/art'
import { Loading } from './components/kit'
import { HomePage } from './pages/HomePage'
import { LessonsPage } from './pages/LessonsPage'
import { LessonDetailPage } from './pages/LessonDetailPage'
import { HomeworkPage } from './pages/HomeworkPage'
import { DiaryPage } from './pages/DiaryPage'
import { ProfilePage } from './pages/ProfilePage'
import { QuizzesPage } from './pages/QuizzesPage'
import { QuizPage } from './pages/QuizPage'
import { ChatPage } from './pages/ChatPage'
import './student.css'

const NAV = [
  { to: '/student', label: 'Bosh sahifa', icon: HomeIcon, end: true },
  { to: '/student/lessons', label: 'Darslar', icon: BookIcon },
  { to: '/student/diary', label: 'Kundalik', icon: CalendarIcon },
  { to: '/student/profile', label: 'Men', icon: UserIcon },
]

// Screens reached from another screen (not from the bottom bar) get Telegram's own back button.
const TOP_LEVEL = new Set(NAV.map((n) => n.to))

const CREAM = '#FFF8EE'

/**
 * The design is a single bright, warm theme (made for children), so the Mini
 * App stays light even when Telegram is dark -- and paints Telegram's own
 * header and background cream to match.
 */
function useTelegramTheme() {
  useEffect(() => {
    const app = webApp()
    document.documentElement.classList.remove('dark')
    document.body.style.backgroundColor = CREAM
    app?.setHeaderColor?.(CREAM)
    app?.setBackgroundColor?.(CREAM)
    app?.setBottomBarColor?.('#FFFFFF')
    app?.ready()
    app?.expand()
  }, [])
}

function useTelegramBackButton() {
  const location = useLocation()
  const navigate = useNavigate()
  useEffect(() => {
    const back = webApp()?.BackButton
    if (!back) return
    const onBack = () => navigate(-1)
    if (TOP_LEVEL.has(location.pathname.replace(/\/+$/, ''))) {
      back.hide()
    } else {
      back.show()
      back.onClick(onBack)
    }
    return () => back.offClick(onBack)
  }, [location.pathname, navigate])
}

function FullScreenMessage({ icon, title, text }: { icon: string; title: string; text: string }) {
  return (
    <div className="flex min-h-screen flex-col items-center justify-center bg-tg-cream px-8 text-center font-tg-body text-tg-ink">
      <p className="flex h-24 w-24 items-center justify-center rounded-[28px] bg-tg-sun text-5xl" aria-hidden>
        {icon}
      </p>
      <h1 className="mt-5 font-tg-display text-[26px] font-semibold leading-tight">{title}</h1>
      <p className="mt-2 text-[15px] font-bold leading-relaxed text-tg-muted">{text}</p>
      {webApp() && (
        <button
          onClick={() => webApp()?.close()}
          className="mt-6 min-h-12 rounded-[18px] bg-tg-blue px-6 text-base font-extrabold text-white"
        >
          Botga qaytish
        </button>
      )}
    </div>
  )
}

/** The bottom bar -- left off the chat screen, whose composer sits there instead. */
function BottomNav() {
  const { pathname } = useLocation()
  if (/^\/student\/chat\/?$/.test(pathname)) return null
  return (
    <nav className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-tg-line bg-white pb-[max(12px,env(safe-area-inset-bottom))] pt-2">
      <div className="mx-auto grid max-w-lg grid-cols-4 px-1.5">
        {NAV.map(({ to, label, icon: Icon, end }) => (
          <NavLink
            key={to}
            to={to}
            end={end}
            className={({ isActive }) =>
              `flex flex-col items-center justify-center gap-0.5 text-xs font-extrabold ${isActive ? 'text-tg-blue' : 'text-tg-muted'}`
            }
          >
            {({ isActive }) => (
              <>
                <span className={`flex rounded-2xl px-4 py-1.5 ${isActive ? 'bg-tg-blue text-white' : ''}`}>
                  <Icon size={24} />
                </span>
                {label}
              </>
            )}
          </NavLink>
        ))}
      </div>
    </nav>
  )
}

export function StudentApp() {
  useTelegramTheme()
  useTelegramBackButton()
  const hasInitData = initData() !== ''

  // The home call doubles as the "who am I" check: it tells us whether this
  // Telegram account is linked before any section renders.
  const gate = useQuery({ queryKey: ['mini', 'home'], queryFn: miniApi.home, enabled: hasInitData })

  if (!hasInitData) {
    return (
      <FullScreenMessage
        icon="📱"
        title="Ilovani Telegram orqali oching"
        text="Bu sahifa Toshqoʻrgʻon Academy botining ichida ishlaydi. Botni oching va «Ilova» tugmasini bosing."
      />
    )
  }
  if (gate.error instanceof MiniApiError && gate.error.notLinked) {
    return (
      <FullScreenMessage
        icon="🔑"
        title="Hisobingiz hali ulanmagan"
        text="Botga administrator bergan oʻquvchi kodini yuboring. Kod qabul qilingach, ilova ochiladi."
      />
    )
  }
  if (gate.error instanceof MiniApiError && gate.error.statusCode === 401) {
    return (
      <FullScreenMessage
        icon="⏳"
        title="Sessiya eskirgan"
        text="Ilovani yoping va bot orqali qaytadan oching."
      />
    )
  }
  if (gate.isLoading) return <Loading />

  return (
    <div className="mx-auto min-h-screen max-w-lg bg-tg-cream pb-28 font-tg-body text-tg-ink">
      <Routes>
        <Route index element={<HomePage />} />
        <Route path="lessons" element={<LessonsPage />} />
        <Route path="lessons/:id" element={<LessonDetailPage />} />
        <Route path="homework" element={<HomeworkPage />} />
        <Route path="diary" element={<DiaryPage />} />
        {/* Older links (bot messages) pointed at the separate progress/attendance screens Kundalik replaced. */}
        <Route path="progress" element={<Navigate to="/student/diary" replace />} />
        <Route path="attendance" element={<Navigate to="/student/diary" replace />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="quizzes" element={<QuizzesPage />} />
        <Route path="quizzes/:id" element={<QuizPage />} />
        <Route path="chat" element={<ChatPage />} />
        <Route path="*" element={<Navigate to="/student" replace />} />
      </Routes>

      <BottomNav />
    </div>
  )
}
