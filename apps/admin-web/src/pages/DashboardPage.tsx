import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { Clock, GraduationCap, School, Users } from 'lucide-react'
import { groups as groupsApi, students as studentsApi, teachers as teachersApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { weekdayCode } from '../lib/schedule'
import { Badge, Card, PageHeader, Spinner, EmptyState } from '../components/ui'
import { LiveClock } from '../components/dashboard/LiveClock'
import { WeeklyTimetable } from '../components/dashboard/WeeklyTimetable'

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

  const today = weekdayCode(new Date())
  const todaysGroups = (groupsQuery.data ?? [])
    .filter((g) => g.scheduleDays.includes(today))
    .sort((a, b) => a.scheduleTime.localeCompare(b.scheduleTime))

  return (
    <div className="space-y-6">
      <PageHeader
        title={isAdmin ? 'Umumiy koʻrinish' : 'Bugungi dars jadvali'}
        description={isAdmin ? 'Markazning umumiy holati' : 'Sizning bugungi guruhlaringiz'}
        actions={<LiveClock />}
      />

      {isAdmin && (
        <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
          <StatCard icon={Users} label="Faol oʻquvchilar" value={studentsQuery.data?.length} />
          <StatCard icon={School} label="Guruhlar" value={groupsQuery.data?.length} />
          <StatCard icon={GraduationCap} label="Oʻqituvchilar" value={teachersQuery.data?.length} />
        </div>
      )}

      <Card className="p-5">
        <div className="mb-4 flex items-center gap-2 text-sm font-medium text-slate-700 dark:text-slate-300">
          <Clock className="h-4 w-4 text-brand-600 dark:text-brand-400" />
          {isAdmin ? 'Barcha guruhlarning bugungi darslari' : 'Bugun darsingiz bor guruhlar'}
        </div>

        {todaysGroups.length === 0 ? (
          <EmptyState title="Bugun darslar rejalashtirilmagan" description="Dam olish kunidan bahramand boʻling." />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {todaysGroups.map((group) => (
              <li key={group.id}>
                <Link
                  to={`/groups/${group.id}`}
                  className="flex items-center justify-between gap-4 py-3 transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/60 -mx-2 px-2 rounded-lg"
                >
                  <div>
                    <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{group.name}</p>
                    <p className="text-xs text-slate-500 dark:text-slate-400">
                      {group.level?.name ?? 'Daraja'} · {group.teacher?.fullName ?? "Oʻqituvchi"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <Badge tone="brand">
                      <Clock className="h-3 w-3" /> {group.scheduleTime}
                    </Badge>
                    <Badge tone="slate">
                      <Users className="h-3 w-3" /> {group.enrollments?.length ?? 0}
                    </Badge>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {isAdmin && <WeeklyTimetable groups={groupsQuery.data ?? []} />}
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
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-brand-50 dark:bg-brand-500/10 text-brand-600">
          <Icon className="h-5 w-5" />
        </div>
        <div>
          <p className="text-2xl font-semibold text-slate-900 dark:text-slate-100">{value ?? '—'}</p>
          <p className="text-xs text-slate-500 dark:text-slate-400">{label}</p>
        </div>
      </div>
    </Card>
  )
}
