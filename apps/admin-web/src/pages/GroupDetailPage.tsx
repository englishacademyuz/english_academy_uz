import { useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
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
  const [tab, setTab] = useState<GroupViewTab>('lesson')
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
          <TodayLessonCard group={group} />
          <RecentSessionsCard group={group} />
        </div>
      ) : (
        <StudentsTab group={group} />
      )}
    </div>
  )
}
