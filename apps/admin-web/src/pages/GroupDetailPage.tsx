import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { groups as groupsApi } from '../lib/api'
import { formatScheduleDays } from '../lib/format'
import { PageHeader, Spinner, ErrorBanner } from '../components/ui'
import { TodayLessonCard } from '../components/group/TodayLessonCard'
import { RosterCard } from '../components/group/RosterCard'
import { RecentSessionsCard } from '../components/group/RecentSessionsCard'
import { AssessmentsCard } from '../components/group/AssessmentsCard'

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
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
      />

      <div className="grid gap-6 lg:grid-cols-3">
        <div className="space-y-6 lg:col-span-2">
          <TodayLessonCard group={group} />
          <RecentSessionsCard group={group} />
          <AssessmentsCard group={group} />
        </div>
        <div>
          <RosterCard group={group} />
        </div>
      </div>
    </div>
  )
}
