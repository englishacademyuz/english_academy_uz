import { useQuery } from '@tanstack/react-query'
import { useParams } from 'react-router-dom'
import { miniApi } from '../api'
import {
  AmountRow,
  ANNOUNCEMENT_LABEL,
  AnnouncementCard,
  AnnouncementPicture,
  clockOf,
  EventDateTile,
  eventCountdown,
  postedLabel,
} from '../components/announcement'
import { Empty, ErrorState, Loading, Screen } from '../components/kit'
import { weekdayDate } from '../format'
import type { MiniAnnouncement } from '../types'

const BACK = { to: '/student', label: 'Bosh sahifa' }

/** Every announcement to the student's group, newest first. */
export function NewsPage() {
  const list = useQuery({ queryKey: ['mini', 'announcements'], queryFn: miniApi.announcements })

  if (list.isLoading) return <Loading />
  return (
    <Screen back={BACK} title="Eʼlonlar" subtitle="Yangiliklar, tadbirlar va tashkiliy eʼlonlar">
      {list.error || !list.data ? (
        <ErrorState error={list.error} onRetry={() => list.refetch()} />
      ) : list.data.length === 0 ? (
        <Empty icon={<span className="text-4xl">📭</span>} title="Hozircha eʼlon yoʻq" />
      ) : (
        list.data.map((a) => <AnnouncementCard key={a.id} announcement={a} />)
      )}
    </Screen>
  )
}

/** One announcement in full: its picture, the whole text, when an event is, what a collection asks. */
export function NewsDetailPage() {
  const { id = '' } = useParams()
  const item = useQuery({ queryKey: ['mini', 'announcement', id], queryFn: () => miniApi.announcement(id) })

  if (item.isLoading) return <Loading />
  if (item.error || !item.data) {
    return (
      <Screen back={BACK} title="Eʼlon">
        <ErrorState error={item.error} onRetry={() => item.refetch()} />
      </Screen>
    )
  }
  const a = item.data

  return (
    <Screen back={{ to: '/student/news', label: 'Eʼlonlar' }} eyebrow={ANNOUNCEMENT_LABEL[a.kind]} title={a.title}>
      {a.kind === 'EVENT' && a.eventAt && <EventWhen eventAt={a.eventAt} />}

      {a.image && (
        <AnnouncementPicture
          id={a.id}
          className="w-full rounded-[24px] border-2 border-tg-line object-cover"
        />
      )}

      <p className="whitespace-pre-line rounded-3xl border-2 border-tg-line bg-white p-4 text-[17px] font-semibold leading-relaxed">
        {a.body}
      </p>

      {a.kind === 'ORGANIZATIONAL' && a.amount != null && (
        <div className="rounded-[24px] border-[3px] border-tg-orange bg-tg-peach p-2">
          <AmountRow amount={a.amount} />
        </div>
      )}

      <Signature announcement={a} />
    </Screen>
  )
}

function EventWhen({ eventAt }: { eventAt: string }) {
  const at = new Date(eventAt)
  return (
    <section className="flex items-center gap-4 rounded-[28px] bg-tg-grape p-[18px] text-white">
      <EventDateTile eventAt={eventAt} />
      <div className="flex min-w-0 grow flex-col gap-1">
        <span className="font-tg-display text-[22px] font-semibold leading-tight">{weekdayDate(at)}</span>
        <span className="text-[15px] font-bold text-tg-grape-soft">🕒 soat {clockOf(at)}</span>
        <span className="self-start rounded-full bg-tg-sun px-2.5 py-0.5 text-[13px] font-extrabold text-tg-ink">
          {eventCountdown(eventAt)}
        </span>
      </div>
    </section>
  )
}

function Signature({ announcement: a }: { announcement: MiniAnnouncement }) {
  return (
    <p className="text-center text-[13px] font-bold text-tg-muted">
      {a.authorName} · {postedLabel(a.createdAt)}, {clockOf(new Date(a.createdAt))}
    </p>
  )
}
