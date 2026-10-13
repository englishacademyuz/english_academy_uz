import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { miniApi } from '../api'
import { HomeworkTile } from '../components/art'
import { DeadlineChip } from '../components/Deadline'
import { homeworkPreviewText } from '../components/HomeworkImages'
import { DayBadge, Empty, ErrorState, Loading, Screen, Section } from '../components/kit'
import { deadlineLabel, homeworkDeadline, timeLeft, urgencyOf, useNow } from '../deadline'
import { doneTasks, submissionContents, tasksProgress, weekdayDate } from '../format'
import { richTextToPlain } from '../../lib/richText'
import type { MiniHomework } from '../types'

/** Where a homework row leads: its hand-in screen (photos, voice notes), else its lesson. */
const homeworkLink = (h: MiniHomework) => (h.submissionEnabled ? `/student/homework/${h.lessonId}` : `/student/lessons/${h.lessonId}`)

/** The hand-in state of one homework, task by task, for groups that take homework through the platform. */
function SubmissionChip({ homework }: { homework: MiniHomework }) {
  if (!homework.submissionEnabled) return null
  const p = tasksProgress(homework.tasks)
  const several = p.total > 1
  const only = homework.tasks[0]?.submission
  const look =
    p.returned > 0
      ? { cls: 'bg-tg-cherry-soft text-tg-cherry', text: several ? `🔁 ${p.returned} ta vazifani qayta ishlash` : '🔁 Qayta ishlash' }
      : p.total > 0 && p.checked === p.total
        ? { cls: 'bg-tg-blue-soft text-tg-blue-dark', text: '⭐ Tekshirildi' }
        : p.handedIn === 0
          ? { cls: 'bg-tg-sand text-tg-muted', text: several ? `📷 0/${p.total} topshirildi` : '📷 Topshirilmagan' }
          : several
            ? { cls: 'bg-tg-leaf-soft text-tg-leaf-dark', text: `✅ ${p.handedIn}/${p.total} topshirildi` }
            : { cls: 'bg-tg-leaf-soft text-tg-leaf-dark', text: `✅ Topshirildi · ${submissionContents(only!)}` }
  return <span className={`self-start rounded-full px-2.5 py-1 text-[13px] font-extrabold ${look.cls}`}>{look.text}</span>
}

/** Every task handed in and none sent back -- the deadline no longer needs to shout. */
const handedIn = (h: MiniHomework) => doneTasks(h.tasks).length === h.tasks.length

/** The teacher added pictures to this homework. */
function ImagesChip({ count }: { count: number }) {
  if (count === 0) return null
  return (
    <span className="self-start rounded-full bg-tg-grape-soft px-2.5 py-1 text-[13px] font-extrabold text-tg-grape">
      🖼 {count} ta rasmli vazifa
    </span>
  )
}

/**
 * Uyga vazifalar: what to do, per lesson. Usually checked in class and graded in Kundalik; in
 * groups that take photos, each row also shows whether it's been handed in.
 */
export function HomeworkPage() {
  const homework = useQuery({ queryKey: ['mini', 'homework'], queryFn: miniApi.homework })
  const now = useNow()
  const back = { to: '/student/lessons', label: 'Darslar' }

  if (homework.isLoading) return <Loading />
  if (homework.error || !homework.data) {
    return (
      <Screen back={back} title="Uyga vazifalar">
        <ErrorState error={homework.error} onRetry={() => homework.refetch()} />
      </Screen>
    )
  }

  const [latest, ...older] = homework.data
  const latestDue = latest ? homeworkDeadline(latest.dueDate, latest.images, now, latest.submissionEnabled ? doneTasks(latest.tasks) : []) : null
  const urgency = latestDue ? urgencyOf(latestDue.at, now) : null
  // Less than a day left on a task not handed in: the card turns red and counts down.
  const hurry = !!latest && !handedIn(latest) && (urgency === 'soon' || urgency === 'hot')
  return (
    <Screen
      back={back}
      title="Uyga vazifalar"
      subtitle={latest?.submissionEnabled ? "Vazifani suratga olib, shu yerdan topshiring" : "Ustoz darsda tekshiradi, baho Kundalikda chiqadi"}
    >
      {!latest ? (
        <Empty icon={<span className="text-4xl">🎉</span>} title="Hozircha uyga vazifa berilmagan" />
      ) : (
        <>
          <Link
            to={homeworkLink(latest)}
            className={`flex items-center gap-4 rounded-[28px] border-[3px] p-[18px] active:scale-[0.99] ${
              hurry ? 'border-tg-cherry bg-tg-cherry-soft' : 'border-tg-sun bg-tg-sun-soft'
            }`}
          >
            <HomeworkTile size={72} />
            <div className="flex min-w-0 grow flex-col gap-1">
              <span className={`flex items-center gap-1.5 text-sm font-extrabold ${hurry ? 'text-tg-cherry' : 'text-tg-sun-ink'}`}>
                {hurry && (
                  <span className="relative flex h-2.5 w-2.5 shrink-0">
                    <span className="absolute inset-0 animate-ping rounded-full bg-tg-cherry/60" />
                    <span className="relative h-2.5 w-2.5 rounded-full bg-tg-cherry" />
                  </span>
                )}
                {hurry ? 'MUDDAT YAQIN' : 'ENG SOʻNGGI'}
              </span>
              <span className="line-clamp-4 font-tg-display text-xl font-semibold leading-snug">{homeworkPreviewText(richTextToPlain(latest.instructions), latest.images)}</span>
              <span className={`text-sm font-bold ${hurry ? 'text-tg-cherry' : 'text-tg-sun-body'}`}>
                {latestDue ? deadlineLabel(latestDue.at, now) : latest.topic || weekdayDate(new Date(latest.date))}
              </span>
              {hurry && latestDue && (
                <span className="self-start rounded-full bg-tg-cherry px-3 py-1 font-tg-display text-lg font-bold tabular-nums text-white">
                  ⏰ {timeLeft(latestDue.at, now)} qoldi
                </span>
              )}
              <ImagesChip count={latest.images.length} />
              <SubmissionChip homework={latest} />
            </div>
            <ChevronRight className="h-6 w-6 shrink-0" strokeWidth={2.5} />
          </Link>

          {older.length > 0 && (
            <Section title="Oldingi vazifalar">
              <div className="flex flex-col gap-2.5">
                {older.map((h) => {
                  const due = handedIn(h) ? null : homeworkDeadline(h.dueDate, h.images, now, h.submissionEnabled ? doneTasks(h.tasks) : [])
                  return (
                  <Link
                    key={h.lessonId}
                    to={homeworkLink(h)}
                    className="flex items-center gap-3 rounded-[22px] border-2 border-tg-line bg-white p-3.5 active:scale-[0.99]"
                  >
                    <DayBadge date={new Date(h.date)} />
                    <div className="flex min-w-0 grow flex-col gap-0.5">
                      {h.topic && <span className="truncate text-[13px] font-extrabold uppercase text-tg-muted">{h.topic}</span>}
                      <span className="line-clamp-2 text-[15px] font-bold">{homeworkPreviewText(richTextToPlain(h.instructions), h.images)}</span>
                      {due && <DeadlineChip due={due.at} />}
                      <ImagesChip count={h.images.length} />
                      <SubmissionChip homework={h} />
                    </div>
                    <ChevronRight className="h-5 w-5 shrink-0 text-tg-faint" strokeWidth={2.5} />
                  </Link>
                  )
                })}
              </div>
            </Section>
          )}
        </>
      )}
    </Screen>
  )
}
