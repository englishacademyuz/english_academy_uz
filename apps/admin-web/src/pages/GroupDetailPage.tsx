import { useMemo, useState } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { useNavigate, useParams, useSearchParams } from 'react-router-dom'
import { BookOpen, Brain, Camera, Clock, Pencil, Trash2, Users } from 'lucide-react'
import { groups as groupsApi, homeworkSubmissions as submissionsApi } from '../lib/api'
import { useAuth } from '../lib/auth'
import { dayLabel } from '../lib/format'
import { levelStyles } from '../lib/levelColor'
import { Spinner, ErrorBanner, PageTabs, Button } from '../components/ui'
import { LiveClock } from '../components/dashboard/LiveClock'
import { TodayLessonCard } from '../components/group/TodayLessonCard'
import { RecentSessionsCard } from '../components/group/RecentSessionsCard'
import { StudentsTab } from '../components/group/StudentsTab'
import { QuizTab } from '../components/group/QuizTab'
import { HomeworkTab } from '../components/homework/HomeworkTab'
import { DeleteGroupModal, GroupFormModal, WEEKDAYS } from '../components/group/GroupFormModal'
import { UpcomingChanges } from '../components/group/UpcomingChanges'

type GroupViewTab = 'lesson' | 'students' | 'quizzes' | 'homework'

export function GroupDetailPage() {
  const { id } = useParams<{ id: string }>()
  const { actor } = useAuth()
  const isAdmin = actor?.role === 'ADMIN'
  const navigate = useNavigate()
  const queryClient = useQueryClient()
  const [searchParams] = useSearchParams()
  const [editing, setEditing] = useState(false)
  const [deleting, setDeleting] = useState(false)
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
  const takesPhotos = !!groupQuery.data?.homeworkSubmissionEnabled
  const unchecked = useQuery({ queryKey: ['homework-unchecked'], queryFn: submissionsApi.unchecked, enabled: takesPhotos })
  const waiting = (id && unchecked.data?.byGroup[id]) || 0

  if (groupQuery.isLoading) return <Spinner />
  if (groupQuery.isError || !groupQuery.data) return <ErrorBanner message="Guruh topilmadi" />

  const group = groupQuery.data
  const accent = levelStyles(group.level?.color)

  return (
    <div>
      <div className="relative mb-6 overflow-hidden rounded-xl border border-slate-200 bg-white p-5 shadow-sm dark:border-slate-800 dark:bg-slate-900">
        <span className="absolute inset-y-0 left-0 w-1.5" style={accent.fill} />
        <div className="flex flex-wrap items-start justify-between gap-4 pl-2">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <h1 className="text-2xl font-semibold tracking-tight text-slate-900 dark:text-slate-100">{group.name}</h1>
              {group.level && (
                <span className="inline-flex items-center gap-1.5 rounded-full px-2.5 py-0.5 text-xs font-semibold" style={accent.soft}>
                  <span className="h-1.5 w-1.5 rounded-full" style={accent.fill} />
                  {group.level.name}
                </span>
              )}
            </div>
            <div className="mt-3 flex flex-wrap items-center gap-x-4 gap-y-2 text-sm text-slate-500 dark:text-slate-400">
              <span className="flex gap-1">
                {WEEKDAYS.map((day) => {
                  const active = group.scheduleDays.includes(day)
                  return (
                    <span
                      key={day}
                      style={active ? accent.solid : undefined}
                      className={`flex h-6 w-7 items-center justify-center rounded-md text-[10px] font-bold ${
                        active ? '' : 'bg-slate-100 text-slate-400 dark:bg-slate-800 dark:text-slate-600'
                      }`}
                    >
                      {dayLabel[day]}
                    </span>
                  )
                })}
              </span>
              <span className="flex items-center gap-1.5 font-semibold" style={accent.text}>
                <Clock className="h-4 w-4" /> {group.scheduleTime}
              </span>
              <span className="flex items-center gap-1.5">
                <Users className="h-4 w-4" /> {group.enrollments?.length ?? 0} oʻquvchi
              </span>
              {group.teacher && <span>{group.teacher.fullName}</span>}
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            {isAdmin && (
              <>
                <Button variant="secondary" size="sm" onClick={() => setEditing(true)}>
                  <Pencil className="h-3.5 w-3.5" /> Tahrirlash
                </Button>
                <Button variant="danger" size="sm" onClick={() => setDeleting(true)} title="Guruhni oʻchirish">
                  <Trash2 className="h-3.5 w-3.5" />
                </Button>
              </>
            )}
            <LiveClock />
          </div>
        </div>
      </div>

      <UpcomingChanges group={group} />

      <div className="mb-6">
        <PageTabs
          tabs={[
            { key: 'lesson' as const, label: 'Dars', icon: BookOpen },
            { key: 'students' as const, label: "Oʻquvchilar", icon: Users },
            { key: 'quizzes' as const, label: 'Testlar', icon: Brain },
            // Only for groups that take homework as photos.
            ...(takesPhotos
              ? [{ key: 'homework' as const, label: waiting ? `Uyga vazifalar (${waiting})` : 'Uyga vazifalar', icon: Camera }]
              : []),
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
      ) : tab === 'students' ? (
        <StudentsTab group={group} initialDate={deepLinkDate} />
      ) : tab === 'homework' && takesPhotos ? (
        <HomeworkTab group={group} />
      ) : (
        <QuizTab group={group} initialDate={deepLinkDate} />
      )}

      {editing && (
        <GroupFormModal
          group={group}
          onClose={() => setEditing(false)}
          onSaved={() => {
            queryClient.invalidateQueries({ queryKey: ['group', id] })
            queryClient.invalidateQueries({ queryKey: ['groups'] })
            setEditing(false)
          }}
        />
      )}
      {deleting && (
        <DeleteGroupModal group={group} onClose={() => setDeleting(false)} onDeleted={() => navigate('/groups')} />
      )}
    </div>
  )
}
