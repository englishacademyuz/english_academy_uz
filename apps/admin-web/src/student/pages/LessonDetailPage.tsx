import { useState, type ReactNode } from 'react'
import { useQuery } from '@tanstack/react-query'
import { Link, useParams } from 'react-router-dom'
import { ExternalLink, FileSpreadsheet, HardDrive, Link2, Presentation, X } from 'lucide-react'
import { MaterialViewer, materialLook } from '../../components/shared/MaterialPreview'
import { RichText } from '../../components/shared/RichText'
import { isRichTextEmpty } from '../../lib/richText'
import { docKind, parseHttpUrl, type DocKind } from '../../lib/materials'
import { miniApi } from '../api'
import { CheckIcon, ClockIcon, DocIcon, HomeworkScene, PlayIcon } from '../components/art'
import { HomeworkImages } from '../components/HomeworkImages'
import { ErrorState, Loading, Screen, Section } from '../components/kit'
import { weekdayDate, weekdayDayMonth } from '../format'
import type { MiniLessonDetail } from '../types'

type Material = MiniLessonDetail['materials'][number]

/** The design's tile per material kind: surface, icon square, icon, and the action word. */
const TILE: Record<'video' | DocKind, { surface: string; square: string; icon: ReactNode; action: string }> = {
  video: { surface: '#E6ECFF', square: '#3B5BDB', icon: <PlayIcon size={26} />, action: 'Koʻrish' },
  document: { surface: '#FFE8CC', square: '#C2410C', icon: <DocIcon size={26} />, action: 'Ochish' },
  spreadsheet: { surface: '#E3F7E6', square: '#2F9E44', icon: <FileSpreadsheet className="h-[26px] w-[26px]" />, action: 'Ochish' },
  presentation: { surface: '#FFF3BF', square: '#F08C00', icon: <Presentation className="h-[26px] w-[26px]" />, action: 'Ochish' },
  drive: { surface: '#F3ECDF', square: '#5C6680', icon: <HardDrive className="h-[26px] w-[26px]" />, action: 'Ochish' },
  other: { surface: '#E5DBFF', square: '#7048E8', icon: <Link2 className="h-[26px] w-[26px]" />, action: 'Ochish' },
}

function tileOf(material: Material) {
  return materialLook(material).kind === 'youtube' ? TILE.video : TILE[docKind(material.content)]
}

export function LessonDetailPage() {
  const { id } = useParams<{ id: string }>()
  const lesson = useQuery({ queryKey: ['mini', 'lesson', id], queryFn: () => miniApi.lesson(id!), enabled: !!id })
  const back = { to: '/student/lessons', label: 'Darslar' }

  if (lesson.isLoading) return <Loading />
  if (lesson.error || !lesson.data) {
    return (
      <Screen back={back} title="Dars">
        <ErrorState error={lesson.error} onRetry={() => lesson.refetch()} />
      </Screen>
    )
  }

  const { topic, date, group, notes, materials, homework } = lesson.data
  return (
    <Screen back={back} eyebrow={weekdayDayMonth(new Date(date))} title={topic || 'Mavzu kiritilmagan'} subtitle={group}>
      {!isRichTextEmpty(notes) && (
        <Section title="Tushuntirish">
          <div className="rounded-[22px] border-2 border-tg-line bg-white px-4 py-3.5">
            <RichText value={notes!} variant="tg" />
          </div>
        </Section>
      )}

      <Section title="Dars materiallari">
        {materials.length === 0 ? (
          <p className="rounded-[22px] bg-tg-sand px-4 py-5 text-center text-[15px] font-bold text-tg-muted">
            Bu dars uchun material qoʻshilmagan
          </p>
        ) : (
          <Materials materials={materials} />
        )}
      </Section>

      {homework ? (
        <Homework homework={homework} lessonId={lesson.data.id} />
      ) : (
        <p className="rounded-[22px] bg-tg-sand px-4 py-5 text-center text-[15px] font-bold text-tg-muted">
          Bu darsda uyga vazifa berilmagan
        </p>
      )}
    </Screen>
  )
}

/** Two-column tiles; tapping one opens it in a viewer right under the grid. */
function Materials({ materials }: { materials: Material[] }) {
  const [openIndex, setOpenIndex] = useState<number | null>(null)
  const open = openIndex !== null ? materials[openIndex] : null

  return (
    <div className="flex flex-col gap-2.5">
      <div className="grid grid-cols-2 gap-2.5">
        {materials.map((m, i) => {
          const tile = tileOf(m)
          const active = openIndex === i
          return (
            <button
              key={m.id}
              type="button"
              onClick={() => setOpenIndex(active ? null : i)}
              className={`flex flex-col items-start gap-2.5 rounded-[22px] p-4 text-left active:scale-[0.99] ${
                active ? 'outline-[3px] outline-offset-2 outline-tg-ink outline-solid' : ''
              }`}
              style={{ backgroundColor: tile.surface }}
            >
              <span className="flex h-[52px] w-[52px] items-center justify-center rounded-2xl text-white" style={{ backgroundColor: tile.square }}>
                {tile.icon}
              </span>
              <span className="text-base font-extrabold">{materialLook(m).label}</span>
              <span className="text-[13px] font-bold text-tg-body">{active ? 'Yopish' : tile.action}</span>
            </button>
          )
        })}
      </div>

      {open && (
        <div className="overflow-hidden rounded-[22px] border-2 border-tg-line bg-white">
          <div className="flex items-center justify-between gap-2 border-b-2 border-tg-line px-4 py-2">
            <span className="text-[15px] font-extrabold">{materialLook(open).label}</span>
            <span className="flex items-center gap-1">
              <a
                href={parseHttpUrl(open.content)?.href}
                target="_blank"
                rel="noreferrer"
                aria-label="Yangi oynada ochish"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-tg-muted active:bg-tg-sand"
              >
                <ExternalLink className="h-5 w-5" />
              </a>
              <button
                type="button"
                onClick={() => setOpenIndex(null)}
                aria-label="Yopish"
                className="flex h-10 w-10 items-center justify-center rounded-xl text-tg-muted active:bg-tg-sand"
              >
                <X className="h-5 w-5" />
              </button>
            </span>
          </div>
          <div className="p-2">
            <MaterialViewer material={open} />
          </div>
        </div>
      )}
    </div>
  )
}

function Homework({ homework, lessonId }: { homework: NonNullable<MiniLessonDetail['homework']>; lessonId: string }) {
  const submission = homework.submission
  return (
    <section className="flex flex-col items-center gap-3.5 rounded-[30px] border-[3px] border-tg-sun bg-tg-sun-soft px-[18px] py-[22px] text-center">
      <HomeworkScene />
      <span className="text-sm font-extrabold text-tg-sun-ink">UYGA VAZIFA</span>
      {homework.dueDate && (
        <div className="flex items-center gap-2 rounded-full bg-white px-3.5 py-2 text-[15px] font-extrabold">
          <ClockIcon size={20} strokeWidth={2.4} className="text-tg-rust" />
          {weekdayDate(new Date(homework.dueDate))} gacha
        </div>
      )}
      {!isRichTextEmpty(homework.instructions) && (
        <div className="flex w-full flex-col gap-1.5 rounded-[20px] bg-white px-4 py-3.5 text-left">
          <span className="text-[13px] font-extrabold text-tg-muted">USTOZ YOZDI</span>
          <RichText value={homework.instructions} variant="tg" />
        </div>
      )}
      <HomeworkImages images={homework.images} />
      {homework.submissionEnabled ? (
        // This group hands homework in as photos -- the hand-in screen has the camera.
        <Link
          to={`/student/homework/${lessonId}`}
          className="flex min-h-14 w-full items-center justify-center gap-2 rounded-[18px] bg-tg-blue px-4 text-lg font-extrabold text-white active:scale-[0.99]"
        >
          {!submission
            ? '📷 Vazifani topshirish'
            : submission.status === 'CHECKED'
              ? '⭐ Tekshirildi — koʻrish'
              : submission.status === 'RETURNED'
                ? '🔁 Qayta topshirish'
                : `✅ Topshirildi · ${submission.photos.length} rasm`}
        </Link>
      ) : (
        // Otherwise it's checked by the teacher in class (CONTEXT.md: HomeworkResult), so there's no "done" button here.
        <div className="flex w-full items-center justify-center gap-2 rounded-[18px] border-[3px] border-tg-leaf bg-tg-leaf-soft px-3 py-3.5 text-base font-extrabold text-tg-leaf-dark">
          <CheckIcon size={22} />
          Ustoz darsda tekshiradi
        </div>
      )}
    </section>
  )
}
