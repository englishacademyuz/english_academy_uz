import { useEffect } from 'react'
import { NavLink, Navigate, Route, Routes, useLocation, useNavigate } from 'react-router-dom'
import { useQuery } from '@tanstack/react-query'
import { BarChart3, BookOpen, ClipboardList, Home, User } from 'lucide-react'
import { MiniApiError, miniApi } from './api'
import { initData, webApp } from './telegram'
import { Loading } from './components/kit'
import { HomePage } from './pages/HomePage'
import { LessonsPage } from './pages/LessonsPage'
import { LessonDetailPage } from './pages/LessonDetailPage'
import { HomeworkPage } from './pages/HomeworkPage'
import { ProgressPage } from './pages/ProgressPage'
import { AttendancePage } from './pages/AttendancePage'
import { ProfilePage } from './pages/ProfilePage'
import { QuizzesPage } from './pages/QuizzesPage'
import { QuizPage } from './pages/QuizPage'

const NAV = [
  { to: '/student', label: 'Bosh sahifa', icon: Home, end: true },
  { to: '/student/lessons', label: 'Oʻqish', icon: BookOpen },
  { to: '/student/homework', label: 'Vazifa', icon: ClipboardList },
  { to: '/student/progress', label: 'Progress', icon: BarChart3 },
  { to: '/student/profile', label: 'Profil', icon: User },
]

// Screens reached from another screen (not from the bottom bar) get Telegram's own back button.
const TOP_LEVEL = new Set(NAV.map((n) => n.to))

/** Follows Telegram's light/dark theme (not the admin panel's saved choice). */
function useTelegramTheme() {
  useEffect(() => {
    const app = webApp()
    const apply = () => {
      const dark = (app?.colorScheme ?? (matchMedia('(prefers-color-scheme: dark)').matches ? 'dark' : 'light')) === 'dark'
      document.documentElement.classList.toggle('dark', dark)
      app?.setHeaderColor?.(dark ? '#020617' : '#f8fafc')
      app?.setBackgroundColor?.(dark ? '#020617' : '#f8fafc')
    }
    apply()
    app?.onEvent('themeChanged', apply)
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
    <div className="flex min-h-screen flex-col items-center justify-center px-8 text-center">
      <p className="text-5xl" aria-hidden>
        {icon}
      </p>
      <h1 className="mt-4 text-xl font-bold text-slate-900 dark:text-white">{title}</h1>
      <p className="mt-2 text-sm leading-relaxed text-slate-500 dark:text-slate-400">{text}</p>
      {webApp() && (
        <button
          onClick={() => webApp()?.close()}
          className="mt-6 rounded-xl bg-brand-600 px-5 py-2.5 text-sm font-semibold text-white"
        >
          Botga qaytish
        </button>
      )}
    </div>
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
        text="Bu sahifa Tashkurgan Academy botining ichida ishlaydi. Botni oching va «Ilova» tugmasini bosing."
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
    <div className="mx-auto min-h-screen max-w-lg pb-24">
      <Routes>
        <Route index element={<HomePage />} />
        <Route path="lessons" element={<LessonsPage />} />
        <Route path="lessons/:id" element={<LessonDetailPage />} />
        <Route path="homework" element={<HomeworkPage />} />
        <Route path="progress" element={<ProgressPage />} />
        <Route path="attendance" element={<AttendancePage />} />
        <Route path="profile" element={<ProfilePage />} />
        <Route path="quizzes" element={<QuizzesPage />} />
        <Route path="quizzes/:id" element={<QuizPage />} />
        <Route path="*" element={<Navigate to="/student" replace />} />
      </Routes>

      <nav className="fixed inset-x-0 bottom-0 z-20 border-t border-slate-200 bg-white/95 pb-[env(safe-area-inset-bottom)] backdrop-blur dark:border-slate-800 dark:bg-slate-950/95">
        <div className="mx-auto grid max-w-lg grid-cols-5">
          {NAV.map(({ to, label, icon: Icon, end }) => (
            <NavLink
              key={to}
              to={to}
              end={end}
              className={({ isActive }) =>
                `flex flex-col items-center gap-0.5 py-2 text-[11px] font-medium ${
                  isActive ? 'text-brand-600 dark:text-brand-400' : 'text-slate-400 dark:text-slate-500'
                }`
              }
            >
              <Icon className="h-5 w-5" />
              {label}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  )
}
