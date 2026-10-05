import { useEffect, useState } from 'react'
import { NavLink, Outlet, useLocation } from 'react-router-dom'
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Menu,
  Moon,
  School,
  Sun,
  Users,
  X,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { roleLabel } from '../lib/format'
import { ChatLauncher } from './chat/ChatLauncher'

const navItems = [
  { to: '/', label: 'Bosh sahifa', icon: LayoutDashboard, end: true },
  { to: '/groups', label: 'Guruhlar', icon: School, end: false },
  { to: '/students', label: "Oʻquvchilar", icon: GraduationCap, end: false },
  { to: '/teachers', label: "Oʻqituvchilar", icon: Users, end: false, adminOnly: true },
  { to: '/subjects', label: "Oʻquv dasturi", icon: BookOpen, end: false, adminOnly: true },
]

// The dashboard's week timetable needs seven readable columns, so it gets a wider page than the rest.
const WIDE_PAGES = new Set(['/'])

export function Layout() {
  const { pathname } = useLocation()
  const { actor, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()
  // Below lg the sidebar is a drawer opened from the top bar's menu button; picking a page closes it.
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => setMenuOpen(false), [pathname])

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <header className="fixed inset-x-0 top-0 z-30 flex h-14 items-center gap-3 border-b border-slate-200 bg-white/95 px-4 backdrop-blur lg:hidden dark:border-slate-800 dark:bg-slate-900/95">
        <button
          onClick={() => setMenuOpen(true)}
          aria-label="Menyuni ochish"
          className="-ml-1 rounded-lg p-1.5 text-slate-600 hover:bg-slate-100 dark:text-slate-300 dark:hover:bg-slate-800"
        >
          <Menu className="h-5 w-5" />
        </button>
        <Brand />
      </header>

      {menuOpen && (
        <div
          className="fixed inset-0 z-40 bg-slate-900/40 lg:hidden dark:bg-slate-950/60"
          onClick={() => setMenuOpen(false)}
        />
      )}

      <aside
        className={`fixed inset-y-0 left-0 z-50 flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white transition-transform duration-200 lg:sticky lg:top-0 lg:z-auto lg:h-screen lg:translate-x-0 lg:shadow-none dark:border-slate-800 dark:bg-slate-900 ${
          menuOpen ? 'translate-x-0 shadow-xl' : '-translate-x-full'
        }`}
      >
        <div className="flex items-center justify-between gap-2 px-5 py-5">
          <Brand />
          <button
            onClick={() => setMenuOpen(false)}
            aria-label="Menyuni yopish"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600 lg:hidden dark:hover:bg-slate-800 dark:hover:text-slate-300"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <nav className="flex-1 space-y-1 overflow-y-auto px-3">
          {navItems
            .filter((item) => !item.adminOnly || actor?.role === 'ADMIN')
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-medium transition-colors lg:py-2 ${
                    isActive
                      ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
        </nav>

        <div className="border-t border-slate-200 p-3 dark:border-slate-800">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium text-slate-700 dark:text-slate-300">
              {actor ? (roleLabel[actor.role] ?? actor.role) : ''}
            </p>
          </div>
          <button
            onClick={toggleTheme}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            {theme === 'dark' ? <Sun className="h-4 w-4" /> : <Moon className="h-4 w-4" />}
            {theme === 'dark' ? 'Yorugʻ rejim' : 'Qorongʻu rejim'}
          </button>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900 dark:text-slate-400 dark:hover:bg-slate-800 dark:hover:text-slate-100"
          >
            <LogOut className="h-4 w-4" />
            Chiqish
          </button>
        </div>
      </aside>

      {/* pt clears the fixed mobile top bar; pb keeps the chat button from covering the page's last row. */}
      <main className="min-w-0 flex-1 px-4 pb-24 pt-[4.5rem] sm:px-6 lg:px-8 lg:py-8">
        <div className={`mx-auto ${WIDE_PAGES.has(pathname) ? 'max-w-7xl' : 'max-w-5xl'}`}>
          <Outlet />
        </div>
      </main>

      <ChatLauncher />
    </div>
  )
}

function Brand() {
  return (
    <div className="flex items-center gap-2">
      <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
        UE
      </div>
      <div>
        <p className="text-sm font-semibold tracking-wide text-slate-900 dark:text-slate-100">UMID EDU</p>
        <p className="text-xs text-slate-400 dark:text-slate-500">Boshqaruv paneli</p>
      </div>
    </div>
  )
}
