import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowRight, CalendarDays, GraduationCap, School, Users } from 'lucide-react'
import { groups as groupsApi, students as studentsApi, teachers as teachersApi } from '../lib/api'
import { formatLongDate } from '../lib/format'
import { useAuth } from '../lib/auth'
import { Card, PageHeader, Spinner, EmptyState } from '../components/ui'

const WEEKDAY_CODES = ['SUN', 'MON', 'TUE', 'WED', 'THU', 'FRI', 'SAT']

function todayCode() {
  return WEEKDAY_CODES[new Date().getDay()]
}

export function DashboardPage() {
  const { actor } = useAuth()
  const isAdmin = actor?.role === 'ADMIN'

  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const studentsQuery = useQuery({
    queryKey: ['students', 'ACTIVE'],
    queryFn: () => studentsApi.list('ACTIVE'),
    enabled: isAdmin,
  })
  const teachersQuery = useQuery({ queryKey: ['teachers'], queryFn: teachersApi.list, enabled: isAdmin })

  if (groupsQuery.isLoading) return <Spinner />

  const today = todayCode()
  const todaysGroups = (groupsQuery.data ?? []).filter((g) => g.scheduleDays.includes(today))

  return (
    <div>
      <PageHeader
        title={isAdmin ? 'Umumiy koʻrinish' : 'Bugungi dars jadvali'}
        description={isAdmin ? 'Markazning umumiy holati' : formatLongDate(new Date())}
      />

      {isAdmin && (
        <div className="mb-8 grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon={Users} label="Faol oʻquvchilar" value={studentsQuery.data?.length} />
          <StatCard icon={School} label="Guruhlar" value={groupsQuery.data?.length} />
          <StatCard icon={GraduationCap} label="Oʻqituvchilar" value={teachersQuery.data?.length} />
        </div>
      )}

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700">
          <CalendarDays className="h-4 w-4 text-brand-600" />
          {isAdmin ? 'Barcha guruhlarning bugungi darslari' : 'Bugun darsingiz bor guruhlar'}
        </div>

        {todaysGroups.length === 0 ? (
          <EmptyState title="Bugun darslar rejalashtirilmagan" description="Dam olish kunidan bahramand boʻling." />
        ) : (
          <ul className="divide-y divide-slate-100">
            {todaysGroups.map((group) => (
              <li key={group.id}>
                <Link
                  to={`/groups/${group.id}`}
                  className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-slate-50 -mx-2 px-2 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900">{group.name}</p>
                    <p className="text-xs text-slate-500">
                      {group.level?.name ?? 'Daraja'} · {group.scheduleTime} · {group.teacher?.fullName ?? "Oʻqituvchi"}
                    </p>
                  </div>
                  <ArrowRight className="h-4 w-4 shrink-0 text-slate-400" />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </div>
  )
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Users
  label: string
  value: number | undefined
}) {
  return (
    <Card className="p-5">
      <div className="flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 text-brand-600">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold text-slate-900">{value ?? '—'}</p>
          <p className="text-xs text-slate-500">{label}</p>
        </div>
      </div>
    </Card>
  )
}
