import { useQuery } from '@tanstack/react-query'
import { studentStatusLabel } from '../../lib/format'
import { miniApi } from '../api'
import { Card, CardTitle, ErrorState, InfoRow, Loading, Screen } from '../components/kit'
import { formatDate, formatSchedule } from '../format'

export function ProfilePage() {
  const profile = useQuery({ queryKey: ['mini', 'profile'], queryFn: miniApi.profile })

  if (profile.isLoading) return <Loading />
  if (profile.error || !profile.data) {
    return (
      <Screen title="Profil">
        <ErrorState error={profile.error} onRetry={() => profile.refetch()} />
      </Screen>
    )
  }

  const { student, group, memberSince, totalPoints, linkedAccounts } = profile.data
  const initials = `${student.firstName[0] ?? ''}${student.lastName[0] ?? ''}`

  return (
    <Screen title="Profil">
      <Card className="flex flex-col items-center py-6 text-center">
        <div className="flex h-20 w-20 items-center justify-center rounded-full bg-gradient-to-br from-brand-500 to-indigo-400 text-2xl font-bold text-white">
          {initials}
        </div>
        <p className="mt-3 text-xl font-bold text-slate-900 dark:text-white">
          {student.firstName} {student.lastName}
        </p>
        <p className="text-sm text-slate-500 dark:text-slate-400">{studentStatusLabel[student.status] ?? student.status}</p>
        <div className="mt-4 rounded-2xl bg-brand-50 px-6 py-3 dark:bg-brand-500/10">
          <p className="text-3xl font-extrabold tabular-nums text-brand-700 dark:text-brand-300">🏆 {totalPoints}</p>
          <p className="text-xs font-medium text-brand-600 dark:text-brand-400">Reyting bali</p>
        </div>
      </Card>

      <Card>
        <CardTitle icon="👤">Shaxsiy maʼlumotlar</CardTitle>
        <div className="divide-y divide-slate-100 dark:divide-slate-800">
          <InfoRow label="Tugʻilgan sana">{formatDate(student.dob)}</InfoRow>
          <InfoRow label="Telefon">{student.phone || 'Kiritilmagan'}</InfoRow>
        </div>
      </Card>

      <Card>
        <CardTitle icon="🏫">Guruh</CardTitle>
        {group ? (
          <div className="divide-y divide-slate-100 dark:divide-slate-800">
            <InfoRow label="Guruh">{group.name}</InfoRow>
            <InfoRow label="Daraja">{group.level}</InfoRow>
            <InfoRow label="Oʻqituvchi">{group.teacher}</InfoRow>
            <InfoRow label="Darslar">{formatSchedule(group)}</InfoRow>
            {memberSince && <InfoRow label="Guruhda">{formatDate(memberSince)} dan beri</InfoRow>}
          </div>
        ) : (
          <p className="text-sm text-slate-500 dark:text-slate-400">Hozircha faol guruhga yozilmagan.</p>
        )}
      </Card>

      <p className="px-2 text-center text-xs text-slate-400 dark:text-slate-500">
        Bu oʻquvchiga {linkedAccounts} ta Telegram hisob ulangan (oʻquvchi va ota-ona).
      </p>
    </Screen>
  )
}
