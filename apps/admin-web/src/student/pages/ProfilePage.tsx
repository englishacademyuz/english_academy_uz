import type { ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ChevronRight, Phone } from 'lucide-react'
import { ageFrom, studentStatusLabel, telHref } from '../../lib/format'
import { miniApi } from '../api'
import { GroupIcon, LockIcon, TrophyIcon } from '../components/art'
import { ErrorState, LabeledValue, Loading, Screen, SectionTitle } from '../components/kit'
import { WeekdayRow } from '../components/schedule'
import { formatDate, initialsOf } from '../format'

/** Men: who I am, my group -- and the facts a parent looks for. */
export function ProfilePage() {
  const profile = useQuery({ queryKey: ['mini', 'profile'], queryFn: miniApi.profile })

  if (profile.isLoading) return <Loading />
  if (profile.error || !profile.data) {
    return (
      <Screen title="Men">
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </Screen>
    )
  }

  const { student, group, memberSince, totalPoints, linkedAccounts } = profile.data
  const status = student.status === 'ACTIVE' ? 'Faol oʻquvchi' : (studentStatusLabel[student.status] ?? student.status)

  return (
    <Screen>
      <section className="flex flex-col items-center gap-2.5 rounded-[30px] bg-tg-grape px-5 py-6 text-center text-white">
        <div className="flex h-24 w-24 items-center justify-center rounded-full border-4 border-white bg-tg-sun font-tg-display text-4xl font-semibold text-tg-ink">
          {initialsOf(student.firstName, student.lastName)}
        </div>
        <h1 className="font-tg-display text-[28px] font-semibold leading-tight">
          {student.firstName} {student.lastName}
        </h1>
        <span
          className={`rounded-full px-3 py-1 text-[13px] font-extrabold ${student.status === 'ACTIVE' ? 'bg-tg-leaf' : 'bg-tg-grape-2'}`}
        >
          {status}
        </span>
        <div className="mt-1.5 flex items-center gap-2.5 rounded-[20px] bg-tg-grape-2 px-[18px] py-2.5">
          <TrophyIcon size={30} strokeWidth={2} className="text-tg-sun" />
          <span className="font-tg-display text-[30px] font-bold tabular-nums">{totalPoints}</span>
          <span className="text-sm font-bold text-tg-grape-soft">ball</span>
        </div>
      </section>

      <section className="flex flex-col gap-3.5 rounded-[26px] border-2 border-tg-line bg-white p-[18px]">
        <SectionTitle>Mening guruhim</SectionTitle>
        {group ? (
          <>
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-tg-blue font-tg-display text-xl font-semibold text-white">
                {initialsOf(group.teacher)}
              </span>
              <LabeledValue label="Ustozim">{group.teacher}</LabeledValue>
            </div>
            {group.teacherPhone && <CallTeacher phone={group.teacherPhone} />}
            <div className="flex items-center gap-3">
              <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-[18px] bg-tg-sun text-tg-ink">
                <GroupIcon size={28} />
              </span>
              <LabeledValue label="Guruhim">{group.name}</LabeledValue>
            </div>
            <WeekdayRow days={group.scheduleDays} />
            <span className="text-center text-[15px] font-extrabold">Darslar soat {group.scheduleTime} da boshlanadi</span>
          </>
        ) : (
          <span className="text-[15px] font-bold text-tg-muted">Hozircha faol guruhga yozilmagan.</span>
        )}
      </section>

      <section className="flex flex-col gap-1 rounded-[26px] bg-tg-sand p-[18px]">
        <div className="mb-2 flex items-center gap-2">
          <LockIcon size={22} />
          <h2 className="font-tg-display text-xl font-semibold">Ota-onalar uchun</h2>
        </div>
        {group && <ParentRow label="Daraja">{group.level}</ParentRow>}
        {memberSince && <ParentRow label="Guruhda">{formatDate(memberSince)} dan beri</ParentRow>}
        {ageFrom(student.dob) !== null && <ParentRow label="Yoshi">{ageFrom(student.dob)} yosh</ParentRow>}
        <ParentRow label="Telefon">{student.phone || 'Kiritilmagan'}</ParentRow>
        <ParentRow label="Ulangan hisoblar" last>
          {linkedAccounts} ta Telegram
        </ParentRow>
        <Link
          to="/student/diary"
          className="mt-2 flex items-center justify-between rounded-2xl bg-white px-4 py-3.5 text-base font-extrabold text-tg-blue-dark"
        >
          Oylik hisobotni koʻrish
          <ChevronRight className="h-[22px] w-[22px]" strokeWidth={2.5} />
        </Link>
      </section>
    </Screen>
  )
}

function ParentRow({ label, children, last }: { label: string; children: ReactNode; last?: boolean }) {
  return (
    <div className={`flex justify-between gap-3 py-2.5 text-[15px] ${last ? '' : 'border-b border-tg-line-strong'}`}>
      <span className="font-bold text-tg-body">{label}</span>
      <span className="text-right font-extrabold">{children}</span>
    </div>
  )
}

/**
 * The teacher's number and a big call button -- both are plain `tel:` links, which Telegram hands
 * to the phone's dialer (Telegram.WebApp.openLink only takes http/https).
 */
function CallTeacher({ phone }: { phone: string }) {
  const href = telHref(phone)
  return (
    <div className="flex flex-col gap-2 rounded-[20px] bg-tg-leaf-soft p-3">
      <a href={href} className="flex items-center gap-2 self-start px-1 text-lg font-extrabold text-tg-leaf-dark tabular-nums">
        <Phone className="h-5 w-5" strokeWidth={2.5} />
        {phone}
      </a>
      <a
        href={href}
        className="flex min-h-12 items-center justify-center gap-2 rounded-[16px] bg-tg-leaf px-4 text-[17px] font-extrabold text-white active:scale-[0.99]"
      >
        <Phone className="h-5 w-5" strokeWidth={2.5} />
        Qoʻngʻiroq qilish
      </a>
    </div>
  )
}
