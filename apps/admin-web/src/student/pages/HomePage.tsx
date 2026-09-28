import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { miniApi } from '../api'
import { Card, CardTitle, Empty, ErrorState, InfoRow, LinkCard, Loading, Pill, Screen, StatTile } from '../components/kit'
import { averageOf, formatDate, formatDateTime, formatSchedule, percent, rateTone } from '../format'

function greeting(now = new Date()) {
  const h = now.getHours()
  if (h < 11) return 'Xayrli tong'
  if (h < 18) return 'Xayrli kun'
  return 'Xayrli kech'
}

export function HomePage() {
  const home = useQuery({ queryKey: ['mini', 'home'], queryFn: miniApi.home })

  if (home.isLoading) return <Loading />
  if (home.error || !home.data) return <Screen title="Bosh sahifa"><ErrorState error={home.error} onRetry={() => home.refetch()} /></Screen>

  const { student, group, lastLesson, latestHomework, openQuizzes, monthProgress, totalPoints } = home.data
  const marks = averageOf(Object.values(monthProgress.academicByCategory))

  return (
    <Screen title={`${greeting()}, ${student.firstName}! 👋`} subtitle={`${student.firstName} ${student.lastName}`}>
      {openQuizzes.map((quiz) => (
        <Link
          key={quiz.id}
          to={`/student/quizzes/${quiz.id}`}
          className="block rounded-2xl bg-gradient-to-br from-brand-600 to-indigo-500 p-4 text-white shadow-md active:scale-[0.99]"
        >
          <p className="text-xs font-medium uppercase tracking-wide opacity-80">🧠 Yangi test</p>
          <p className="mt-1 text-lg font-bold">{quiz.title}</p>
          <p className="mt-1 text-sm opacity-90">
            {quiz.questionCount} ta savol · {quiz.maxPoints} ball
            {quiz.deadline && ` · ${formatDateTime(quiz.deadline)} gacha`}
          </p>
          <span className="mt-3 inline-block rounded-xl bg-white/20 px-3 py-1.5 text-sm font-semibold">
            {quiz.attempt ? 'Davom ettirish →' : 'Boshlash →'}
          </span>
        </Link>
      ))}

      <Card>
        <CardTitle icon="📚">Mening oʻqishim</CardTitle>
        {group ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <InfoRow label="Guruh">{group.name}</InfoRow>
            <InfoRow label="Daraja">{group.level}</InfoRow>
            <InfoRow label="Oʻqituvchi">{group.teacher}</InfoRow>
            <InfoRow label="Darslar">{formatSchedule(group)}</InfoRow>
          </div>
        ) : (
          <Empty icon="🏫" title="Hozircha faol guruhga yozilmagansiz" hint="Administrator bilan bogʻlaning." />
        )}
      </Card>

      {lastLesson && (
        <LinkCard to={`/student/lessons/${lastLesson.id}`}>
          <p className="text-xs font-medium text-slate-500 dark:text-slate-400">📖 Oxirgi dars · {formatDate(lastLesson.date)}</p>
          <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">{lastLesson.topic || 'Mavzu kiritilmagan'}</p>
        </LinkCard>
      )}

      <LinkCard to="/student/homework">
        <p className="text-xs font-medium text-slate-500 dark:text-slate-400">
          📝 Uy vazifasi{latestHomework ? ` · ${formatDate(latestHomework.date)}` : ''}
        </p>
        <p className="mt-0.5 font-semibold text-slate-900 dark:text-white">
          {latestHomework ? latestHomework.instructions : 'Hozircha uy vazifasi berilmagan'}
        </p>
      </LinkCard>

      <Card>
        <CardTitle icon="📊" action={<Link to="/student/progress" className="text-sm font-medium text-brand-600 dark:text-brand-400">Batafsil</Link>}>
          Shu oy
        </CardTitle>
        <div className="grid grid-cols-2 gap-2">
          <Link to="/student/attendance">
            <StatTile label="Davomat" value={percent(monthProgress.attendanceRate)} tone={rateTone(monthProgress.attendanceRate)} />
          </Link>
          <StatTile label="Baholar" value={percent(marks)} tone={rateTone(marks)} empty="Hali baholanmagan" />
          <Link to="/student/quizzes">
            <StatTile label="Testlar" value={percent(monthProgress.quizAverage)} tone={rateTone(monthProgress.quizAverage)} empty="Hali test yoʻq" />
          </Link>
          <StatTile label="Reyting bali" value={String(totalPoints)} tone="brand" />
        </div>
        {monthProgress.points > 0 && (
          <p className="mt-3 text-center text-xs text-slate-500 dark:text-slate-400">
            Shu oyda <Pill tone="green">+{monthProgress.points} ball</Pill> toʻplandi
          </p>
        )}
      </Card>
    </Screen>
  )
}
