import { NavLink, Outlet } from 'react-router-dom'
import {
  BookOpen,
  GraduationCap,
  LayoutDashboard,
  LogOut,
  School,
  Users,
  UsersRound,
} from 'lucide-react'
import { useAuth } from '../lib/auth'
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

  return (
    <div className="flex min-h-screen bg-slate-50">
      <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-white">
        <div className="flex items-center gap-2 px-5 py-5">
          <div className="flex h-9 w-9 items-center justify-center rounded-lg bg-brand-600 text-sm font-bold text-white">
            TA
          </div>
          <div>
            <p className="text-sm font-semibold text-slate-900">Tashkurgan Academy</p>
            <p className="text-xs text-slate-400">Boshqaruv paneli</p>
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
                      ? 'bg-brand-50 text-brand-700'
                      : 'text-slate-600 hover:bg-slate-100 hover:text-slate-900'
                  }`
                }
              >
                <item.icon className="h-4 w-4" />
                {item.label}
              </NavLink>
            ))}
        </nav>

        <div className="border-t border-slate-200 p-3">
          <div className="mb-2 px-2">
            <p className="truncate text-sm font-medium text-slate-700">
              {actor ? (roleLabel[actor.role] ?? actor.role) : ''}
            </p>
          </div>
          <button
            onClick={() => logout()}
            className="flex w-full items-center gap-3 rounded-lg px-3 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100 hover:text-slate-900"
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
