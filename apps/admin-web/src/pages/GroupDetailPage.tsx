import { useMemo, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams, useSearchParams } from 'react-router-dom'
import { BookOpen, Users } from 'lucide-react'
import { groups as groupsApi } from '../lib/api'
import { formatScheduleDays } from '../lib/format'
import { PageHeader, Spinner, ErrorBanner, PageTabs } from '../components/ui'
import { LiveClock } from '../components/dashboard/LiveClock'
import { TodayLessonCard } from '../components/group/TodayLessonCard'
import { RecentSessionsCard } from '../components/group/RecentSessionsCard'
import { StudentsTab } from '../components/group/StudentsTab'

type GroupViewTab = 'lesson' | 'students'

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const [searchParams] = useSearchParams()
  // Set when arriving from a calendar deep link (e.g. double-clicking a past
  // lesson in the weekly timetable) -- every date-aware view below opens
  // already scoped to this date instead of defaulting to today.
  const deepLinkDate = useMemo(() => {
    const raw = searchParams.get('date')
    if (!raw) return undefined
    const parsed = new Date(`${raw}T00:00:00`)
    return Number.isNaN(parsed.getTime()) ? undefined : parsed
  }, [searchParams])
  // A calendar deep link is asking about a specific lesson's attendance/marks
  // first and foremost -- topic/resources are still one tab away.
  const [tab, setTab] = useState<GroupViewTab>(deepLinkDate ? 'students' : 'lesson')
  const groupQuery = useQuery({
    queryKey: ['group', id],
    queryFn: () => groupsApi.get(id!),
    enabled: !!id,
  })

  if (groupQuery.isLoading) return <Spinner />
  if (groupQuery.isError || !groupQuery.data) return <ErrorBanner message="Guruh topilmadi" />

  const group = groupQuery.data

  return (
    <div>
      <PageHeader
        title={group.name}
        description={`${group.level?.name ?? ''} · ${group.teacher?.fullName ?? ''} · ${formatScheduleDays(group.scheduleDays)} soat ${group.scheduleTime} da`}
        actions={<LiveClock />}
      />

      <div className="mb-6">
        <PageTabs
          tabs={[
            { key: 'lesson' as const, label: 'Dars', icon: BookOpen },
            { key: 'students' as const, label: "Oʻquvchilar", icon: Users },
          ]}
          active={tab}
          onChange={setTab}
        />
      </div>

      {tab === 'lesson' ? (
        <div className="space-y-6">
          <TodayLessonCard group={group} initialDate={deepLinkDate} />
          <RecentSessionsCard group={group} />
        </div>
      ) : (
        <StudentsTab group={group} initialDate={deepLinkDate} />
      )}
    </div>
  )
}
