import { NavLink, Outlet } from 'react-router-dom'
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  Moon,
  School,
  Sun,
  Users,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
import { useTheme } from '../lib/theme'
import { roleLabel } from '../lib/format'

const navItems = [
  { to: '/', label: 'Bosh sahifa', icon: LayoutDashboard, end: true },
  { to: '/groups', label: 'Guruhlar', icon: School, end: false },
  { to: '/students', label: "Oʻquvchilar", icon: GraduationCap, end: false },
  { to: '/parents', label: 'Ota-onalar', icon: UsersRound, end: false, adminOnly: true },
  { to: '/teachers', label: "Oʻqituvchilar", icon: Users, end: false, adminOnly: true },
  { to: '/subjects', label: "Oʻquv dasturi", icon: BookOpen, end: false, adminOnly: true },
]

export function Layout() {
  const { actor, logout } = useAuth()
  const { theme, toggleTheme } = useTheme()

  return (
    <div className="flex min-h-screen bg-slate-50 dark:bg-slate-950">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white dark:border-slate-800 dark:bg-slate-900">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            TA
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">Tashkurgan Academy</p>
            <p className="text-xs text-slate-400 dark:text-slate-500">Boshqaruv paneli</p>
          </div>
        </div>

        <nav className="flex-1 space-y-1 px-3">
          {navItems
            .filter((item) => !item.adminOnly || actor?.role === 'ADMIN')
            .map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `flex items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium transition-colors ${
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

      <main className="flex-1 overflow-y-auto px-8 py-8">
        <div className="mx-auto max-w-5xl">
          <Outlet />
        </div>
      </main>
    </div>
  )
}
