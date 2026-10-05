import { useEffect, useState } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight } from 'lucide-react'
import { dayKeyOf } from '../../lib/schedule'
import { toDateInputValue } from '../../lib/format'
import { miniApi } from '../api'
import { richTextToPlain } from '../../lib/richText'
import { ClockIcon, CupTile, GradeFace, HomeworkTile, MEDAL, TrophyIcon, isPodium, type Podium } from '../components/art'
import { ErrorState, LinkRow, Loading, Screen, SectionTitle } from '../components/kit'
import { ScheduleChanges, nextLesson, relativeDay } from '../components/schedule'
import { GRADE, MONTHS, averageOf, capitalize, firstName, formatDateTime, gradeOf, initialsOf, weekdayDate } from '../format'
import type { GroupSummary, MiniGroupRanking, MiniHome, MiniPaymentReminder, MiniScheduleChange } from '../types'

export function HomePage() {
  const home = useQuery({ queryKey: ['mini', 'home'], queryFn: miniApi.home })

  if (home.isLoading) return <Loading />
  if (home.error || !home.data) {
    return (
      <Screen title="Bosh sahifa">
        <ErrorState error={home.error} onRetry={() => home.refetch()} />
      </Screen>
    )
  }

  const {
    student,
    group,
    scheduleChanges,
    lastLesson,
    latestHomework,
    openQuizzes,
    monthProgress,
    totalPoints,
    groupRanking,
    payment,
    unreadChat,
  } = home.data

  return (
    <div className="flex flex-col gap-[18px] px-[18px] pb-8 pt-5">
      <header className="flex items-center justify-between gap-3">
        <div className="flex min-w-0 flex-col gap-0.5">
          <span className="text-[13px] font-bold text-tg-muted">Umid Edu</span>
          <h1 className="truncate font-tg-display text-[32px] font-semibold leading-[1.1]">Salom, {student.firstName}!</h1>
        </div>
        <Link
          to="/student/profile"
          aria-label="Mening profilim"
          className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-full bg-tg-grape-2 font-tg-display text-xl font-semibold text-white"
        >
          {initialsOf(student.firstName, student.lastName)}
        </Link>
      </header>

      {payment && <PaymentCard payment={payment} />}

      {unreadChat > 0 && <NewChatMessageCard count={unreadChat} />}

      <PointsCard total={totalPoints} thisMonth={monthProgress.points} ranking={groupRanking} />

      {groupRanking && groupRanking.rows.length > 0 && <GroupRanking ranking={groupRanking} />}

      {group && <Countdown group={group} changes={scheduleChanges} lastLesson={lastLesson} />}

      <ScheduleChanges changes={scheduleChanges} />

      {openQuizzes.map((quiz) => (
        <Link
          key={quiz.id}
          to={`/student/quizzes/${quiz.id}`}
          className="flex flex-col gap-3 rounded-[28px] bg-tg-blue-soft p-[18px] active:scale-[0.99]"
        >
          <span className="text-sm font-extrabold uppercase text-tg-blue-dark">🧠 Yangi test</span>
          <span className="font-tg-display text-[22px] font-semibold leading-tight">{quiz.title}</span>
          <span className="text-sm font-bold text-tg-body">
            {quiz.questionCount} ta savol · {quiz.maxPoints} ball
            {quiz.deadline && ` · ${formatDateTime(quiz.deadline)} gacha`}
          </span>
          <span className="rounded-2xl bg-tg-blue p-3.5 text-center text-[17px] font-extrabold text-white">
            {quiz.attempt ? 'Davom ettirish' : 'Boshlash'}
          </span>
        </Link>
      ))}

      {latestHomework && <HomeworkCard homework={latestHomework} />}

      <MonthTiles progress={monthProgress} />

      {unreadChat === 0 && <LinkRow to="/student/chat">💬 Oʻqituvchi bilan muloqot</LinkRow>}

    </div>
  )
}

/** The teacher answered in the family chat -- shown until the chat is opened. */
function NewChatMessageCard({ count }: { count: number }) {
  return (
    <Link to="/student/chat" className="flex items-center gap-4 rounded-[28px] bg-tg-grape p-[18px] text-white active:scale-[0.99]">
      <span className="relative flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-tg-grape-2 text-3xl" aria-hidden>
        💬
        <span className="absolute -right-1.5 -top-1.5 flex h-6 min-w-6 items-center justify-center rounded-full bg-tg-sun px-1.5 text-[13px] font-extrabold text-tg-ink">
          {count}
        </span>
      </span>
      <span className="flex min-w-0 grow flex-col gap-0.5">
        <span className="text-sm font-extrabold uppercase text-tg-grape-soft">Yangi xabar</span>
        <span className="font-tg-display text-[22px] font-semibold leading-tight">Oʻqituvchidan javob keldi</span>
      </span>
      <ChevronRight className="h-6 w-6 shrink-0" strokeWidth={2.5} />
    </Link>
  )
}

/**
 * The payment nudge: a warm yellow card from three days before the payment day until five days
 * after it, then a red, unhappy one -- the student counts as a debtor from then on.
 */
function PaymentCard({ payment }: { payment: MiniPaymentReminder }) {
  const { stage, daysLeft } = payment
  const debtor = stage === 'debtor'
  const title = {
    upcoming: `${daysLeft} kundan soʻng toʻlov kuni`,
    due: 'Bugun toʻlov kuni!',
    overdue: 'Toʻlov kuni keldi',
    debtor: 'Toʻlov kechikmoqda',
  }[stage]
  const hint = {
    upcoming: 'Toʻlovni oldindan tayyorlab qoʻying 🙂',
    due: 'Iltimos, toʻlovni amalga oshiring yoki markazga olib keling.',
    overdue: `Toʻlov kunidan ${-daysLeft} kun oʻtdi. Iltimos, toʻlovni amalga oshiring yoki olib keling.`,
    debtor: `Toʻlov kunidan ${-daysLeft} kun oʻtdi — qarzdorlik bor. Iltimos, zudlik bilan toʻlang.`,
  }[stage]

  return (
    <section
      className={`flex items-center gap-4 rounded-[28px] border-[3px] p-[18px] ${
        debtor ? 'border-tg-cherry bg-tg-cherry-soft' : 'border-tg-sun bg-tg-sun-soft'
      }`}
    >
      {/* A worried face while it's only due, a sad one once they're a debtor. */}
      <GradeFace grade={debtor ? 2 : 3} size={64} />
      <div className="flex min-w-0 grow flex-col gap-1">
        <span className={`text-sm font-extrabold uppercase ${debtor ? 'text-tg-cherry' : 'text-tg-sun-ink'}`}>
          {debtor ? '❗️ Qarzdorlik' : '🔔 Toʻlov eslatmasi'}
        </span>
        <span className="font-tg-display text-[22px] font-semibold leading-[1.15]">{title}</span>
        <span className={`text-sm font-bold ${debtor ? 'text-tg-cherry' : 'text-tg-sun-body'}`}>{hint}</span>
        <span className="mt-1 flex flex-wrap gap-1.5">
          <span className="rounded-full bg-white px-2.5 py-0.5 text-[13px] font-extrabold">
            📅 {weekdayDate(new Date(payment.dueDate))}
          </span>
          {payment.amount > 0 && (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[13px] font-extrabold tabular-nums">
              💰 {payment.amount.toLocaleString('ru-RU')} soʻm
            </span>
          )}
          {payment.unpaidCycles > 1 && (
            <span className="rounded-full bg-white px-2.5 py-0.5 text-[13px] font-extrabold text-tg-cherry">
              {payment.unpaidCycles} oy toʻlanmagan
            </span>
          )}
        </span>
      </div>
    </section>
  )
}

function PointsCard({
  total,
  thisMonth,
  ranking,
}: {
  total: number
  thisMonth: number
  ranking: MiniGroupRanking | null
}) {
  return (
    <section className="flex flex-col gap-4 rounded-[28px] bg-tg-grape p-5 text-white">
      <div className="flex items-center gap-4">
        <div className="flex h-[76px] w-[76px] shrink-0 items-center justify-center rounded-3xl bg-tg-sun text-tg-ink">
          <TrophyIcon size={44} cupFill="#FFF3BF" />
        </div>
        <div className="flex min-w-0 grow flex-col gap-0.5">
          <span className="text-[15px] font-bold text-tg-grape-soft">Mening ballarim</span>
          <span className="font-tg-display text-5xl font-bold leading-none tabular-nums">{total}</span>
          <span className="mt-1 text-sm font-bold">
            {thisMonth === 0 ? (
              'Bu oy hali ball yoʻq'
            ) : (
              <>
                Bu oy{' '}
                <span className="rounded-full bg-tg-sun px-2 py-0.5 text-tg-ink">
                  {thisMonth > 0 ? '+' : ''}
                  {thisMonth} ball
                </span>{' '}
                yigʻdim
              </>
            )}
          </span>
        </div>
      </div>
      {ranking?.myPlace != null && <MyPlace ranking={ranking} />}
    </section>
  )
}

/** A cup only goes to a place someone actually earned points for -- a fresh group, all on 0, has no winners yet. */
const cupFor = (place: number | null, points: number) => (points > 0 && isPodium(place) ? place : null)

/** "Guruhda 2-oʻrin" -- the student's own place, right under their points. */
function MyPlace({ ranking }: { ranking: MiniGroupRanking }) {
  const cup = cupFor(ranking.myPlace, ranking.myPoints)
  return (
    <div className="flex items-center gap-3 rounded-[20px] bg-tg-grape-2 p-2.5 pr-4">
      {cup ? (
        <CupTile place={cup} size={52} />
      ) : (
        <span className="flex h-[52px] w-[52px] shrink-0 items-center justify-center rounded-[16px] bg-white/15 font-tg-display text-2xl font-bold">
          {ranking.myPlace}
        </span>
      )}
      <div className="flex min-w-0 grow flex-col">
        <span className="font-tg-display text-[22px] font-semibold leading-tight">Guruhda {ranking.myPlace}-oʻrin</span>
        <span className="text-[13px] font-bold text-tg-grape-soft">
          {cup ? `${MEDAL[cup].word} kubok! ` : ''}
          {ranking.rows.length} ta oʻquvchi orasida
        </span>
      </div>
    </div>
  )
}

const COLLAPSED_ROWS = 5

/** The whole group's table: a podium for the top three places, then everyone with their points. */
function GroupRanking({ ranking }: { ranking: MiniGroupRanking }) {
  const [expanded, setExpanded] = useState(false)
  const { rows } = ranking
  // Collapsed, the list keeps the first rows plus the student's own, wherever it is.
  const visible = expanded ? rows : rows.filter((row, i) => i < COLLAPSED_ROWS || row.isMe)

  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>Guruh reytingi</SectionTitle>
      <div className="flex flex-col gap-3 rounded-[28px] border-2 border-tg-line bg-white p-4">
        <PodiumView rows={rows} />
        <ol className="flex flex-col gap-1.5">
          {visible.map((row, i) => {
            const cup = cupFor(row.place, row.points)
            const gap = !expanded && i > 0 && rows.indexOf(row) - rows.indexOf(visible[i - 1]) > 1
            return (
              <li key={row.name + row.place} className="contents">
                {gap && <span className="text-center text-sm font-extrabold leading-none text-tg-faint">⋮</span>}
                <div
                  className={`flex items-center gap-3 rounded-[18px] px-2.5 py-2 ${
                    row.isMe ? 'bg-tg-grape-soft ring-2 ring-inset ring-tg-grape-2' : 'bg-tg-cream'
                  }`}
                >
                  {cup ? (
                    <CupTile place={cup} size={36} />
                  ) : (
                    <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-xl bg-tg-sand font-tg-display text-lg font-semibold text-tg-muted">
                      {row.place}
                    </span>
                  )}
                  <span className={`min-w-0 grow truncate text-base font-extrabold ${row.isMe ? 'text-tg-grape' : ''}`}>
                    {row.name}
                    {row.isMe && <span className="ml-1.5 text-[13px] font-bold text-tg-grape-2">(men)</span>}
                  </span>
                  <span className="shrink-0 font-tg-display text-xl font-semibold tabular-nums">
                    {row.points}
                    <span className="ml-1 font-tg-body text-xs font-bold text-tg-muted">ball</span>
                  </span>
                </div>
              </li>
            )
          })}
        </ol>
        {rows.length > visible.length || expanded ? (
          <button
            onClick={() => setExpanded((e) => !e)}
            className="rounded-[18px] border-2 border-tg-line py-3 text-base font-extrabold text-tg-blue-dark active:scale-[0.99]"
          >
            {expanded ? 'Qisqaroq koʻrsatish' : `Hammasini koʻrish (${rows.length})`}
          </button>
        ) : null}
      </div>
    </section>
  )
}

const STAND_HEIGHT: Record<Podium, number> = { 1: 76, 2: 54, 3: 38 }

/** Places 2 · 1 · 3 on stands of matching height. Everyone tied on a place shares its stand. */
function PodiumView({ rows }: { rows: MiniGroupRanking['rows'] }) {
  const winners = ([2, 1, 3] as const).map((place) => ({
    place,
    rows: rows.filter((row) => row.place === place && row.points > 0),
  }))
  if (winners.every((w) => w.rows.length === 0)) {
    return (
      <div className="flex flex-col items-center gap-1 rounded-[22px] bg-tg-sun-soft px-4 py-5 text-center">
        <span className="font-tg-display text-xl font-semibold text-tg-sun-body">Hali hech kim ball yigʻmagan</span>
        <span className="text-sm font-bold text-tg-sun-ink">Birinchi kubok seniki boʻlishi mumkin!</span>
      </div>
    )
  }

  return (
    <div className="grid grid-cols-3 items-end gap-2 rounded-[22px] bg-tg-cream px-2 pt-3">
      {winners.map(({ place, rows: tied }) => (
        <div key={place} className="flex min-w-0 flex-col items-center gap-1">
          {tied.length > 0 && (
            <>
              <CupTile place={place} size={place === 1 ? 64 : 52} tile={false} />
              <span
                className={`max-w-full truncate text-center text-sm font-extrabold ${
                  tied.some((r) => r.isMe) ? 'text-tg-grape' : ''
                }`}
              >
                {tied.some((r) => r.isMe) ? 'Sen' : tied[0].name.split(' ')[0]}
                {tied.length > 1 && ` +${tied.length - 1}`}
              </span>
            </>
          )}
          <div
            className="flex w-full items-start justify-center rounded-t-[16px] pt-1.5 font-tg-display text-lg font-bold tabular-nums text-tg-ink"
            style={{ height: STAND_HEIGHT[place], backgroundColor: tied.length > 0 ? MEDAL[place].stand : '#EFE4D2' }}
          >
            {tied.length > 0 ? tied[0].points : ''}
          </div>
        </div>
      ))}
    </div>
  )
}

/** Ticks once a second -- only the countdown needs it. */
function useNow() {
  const [now, setNow] = useState(() => new Date())
  useEffect(() => {
    const timer = setInterval(() => setNow(new Date()), 1000)
    return () => clearInterval(timer)
  }, [])
  return now
}

const pad = (n: number) => String(n).padStart(2, '0')

/** Two big tiles, in the largest units that fit: days·hours, hours·minutes, or minutes·seconds. */
function countdownParts(ms: number): Array<[string, string]> {
  const s = Math.max(0, Math.floor(ms / 1000))
  const days = Math.floor(s / 86400)
  const hours = Math.floor((s % 86400) / 3600)
  const minutes = Math.floor((s % 3600) / 60)
  if (days > 0) return [[String(days), 'kun'], [pad(hours), 'soat']]
  if (hours > 0) return [[pad(hours), 'soat'], [pad(minutes), 'daqiqa']]
  return [[pad(minutes), 'daqiqa'], [pad(s % 60), 'soniya']]
}

function Countdown({
  group,
  changes,
  lastLesson,
}: {
  group: GroupSummary
  changes: MiniScheduleChange[]
  lastLesson: MiniHome['lastLesson']
}) {
  const now = useNow()
  const next = nextLesson(group, changes, now)
  if (!next) return null

  const started = next.start <= now
  const parts = countdownParts(next.start.getTime() - now.getTime())
  // The teacher opens the day's lesson (and its topic) around lesson time.
  const topic = lastLesson && dayKeyOf(lastLesson.date) === toDateInputValue(next.start) ? lastLesson.topic : null

  return (
    <section className="flex flex-col gap-3.5 rounded-[28px] bg-tg-ink px-5 py-[22px] text-white">
      <div className="flex items-center gap-2 text-tg-sun">
        <ClockIcon size={22} />
        <span className="text-base font-extrabold">{started ? 'Dars boshlandi!' : 'Dars boshlanishiga'}</span>
        {next.moved && (
          <span className="ml-auto rounded-full bg-tg-orange px-2.5 py-0.5 text-xs font-extrabold text-white">Vaqti oʻzgardi</span>
        )}
      </div>

      {!started && (
        <div className="flex items-end gap-1.5 font-tg-display leading-none" aria-live="off">
          {parts.map(([value, unit], i) => (
            <div key={unit} className="contents">
              {i === 1 && <span className="pb-[34px] text-[64px] font-bold text-tg-sun">:</span>}
              <div className="flex flex-col items-center gap-1.5">
                <span className="min-w-24 rounded-[18px] bg-tg-ink-2 px-3.5 py-2 text-center text-[76px] font-bold text-tg-sun tabular-nums">
                  {value}
                </span>
                <span className="font-tg-body text-[13px] font-bold text-tg-mist">{unit}</span>
              </div>
            </div>
          ))}
        </div>
      )}

      <div className="grid grid-cols-3 gap-2">
        <InfoTile label={relativeDay(next.start, now)} value={next.time} big />
        <InfoTile label="Ustoz" value={firstName(group.teacher)} />
        <InfoTile label="Guruh" value={group.name} />
      </div>
      {topic && <span className="text-[15px] font-bold">Mavzu: {topic}</span>}
    </section>
  )
}

function InfoTile({ label, value, big }: { label: string; value: string; big?: boolean }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 rounded-[14px] bg-tg-ink-2 p-2.5">
      <span className="truncate text-xs font-bold text-tg-mist">{label}</span>
      <span className={`truncate font-extrabold ${big ? 'text-[17px]' : 'text-[15px]'}`}>{value}</span>
    </div>
  )
}

function HomeworkCard({ homework }: { homework: NonNullable<MiniHome['latestHomework']> }) {
  const due = homework.dueDate ? `${weekdayDate(new Date(homework.dueDate))} gacha` : `${weekdayDate(new Date(homework.date))} darsidan`
  return (
    <Link
      to={`/student/lessons/${homework.lessonId}`}
      className="flex items-center gap-4 rounded-[28px] border-[3px] border-tg-sun bg-tg-sun-soft p-[18px] active:scale-[0.99]"
    >
      <HomeworkTile />
      <div className="flex min-w-0 grow flex-col gap-1">
        <span className="text-sm font-extrabold text-tg-sun-ink">UYGA VAZIFA</span>
        <span className="line-clamp-3 font-tg-display text-[22px] font-semibold leading-[1.15]">{richTextToPlain(homework.instructions)}</span>
        <span className="text-sm font-bold text-tg-sun-body">{due}</span>
      </div>
      <ChevronRight className="h-6 w-6 shrink-0" strokeWidth={2.5} />
    </Link>
  )
}

function MonthTiles({ progress }: { progress: MiniHome['monthProgress'] }) {
  const month = MONTHS[new Date().getMonth()]
  const tiles = [
    { label: 'Darsga kelish', percent: progress.attendanceRate },
    { label: 'Baholar', percent: averageOf(Object.values(progress.academicByCategory)) },
    { label: 'Testlar', percent: progress.quizAverage },
  ]
  return (
    <section className="flex flex-col gap-3">
      <SectionTitle>{capitalize(month)}da qanday oʻqidim?</SectionTitle>
      <div className="grid grid-cols-3 gap-2.5">
        {tiles.map(({ label, percent }) => {
          const grade = gradeOf(percent)
          const look = grade ? GRADE[grade] : null
          return (
            <div
              key={label}
              className="flex flex-col items-center gap-1.5 rounded-[22px] px-2 py-3.5 text-center"
              style={{ backgroundColor: look?.light ?? '#F3ECDF' }}
            >
              <GradeFace grade={grade} />
              <span className="font-tg-display text-xl font-semibold leading-tight" style={{ color: look?.dark ?? '#5C6680' }}>
                {look?.word ?? 'Hali yoʻq'}
              </span>
              <span className="text-[13px] font-bold text-tg-body">{label}</span>
            </div>
          )
        })}
      </div>
      <LinkRow to="/student/diary">Kundalikni ochish</LinkRow>
    </section>
  )
}
