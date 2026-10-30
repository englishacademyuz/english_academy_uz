import { useEffect, useRef, useState, type FormEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import {
  CalendarDays,
  Coins,
  ImagePlus,
  Loader2,
  Megaphone,
  Newspaper,
  PartyPopper,
  Plus,
  Send,
  Trash2,
  X,
  type LucideIcon,
} from 'lucide-react'
import { announcements as announcementsApi, groups as groupsApi } from '../lib/api'
import { formatDate, formatDayMonthWeekday, formatMoney, formatTime } from '../lib/format'
import { blobToDataUrl, shrinkPhoto } from '../lib/image'
import { levelStyles } from '../lib/levelColor'
import { notifyError, notifySuccess } from '../lib/toast'
import type { Announcement, AnnouncementKind } from '../lib/types'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  MoneyInput,
  PageHeader,
  Spinner,
  Tabs,
  Textarea,
} from '../components/ui'

/** The server's limits (packages/domain announcement.ts). */
const MAX_TITLE = 120
const MAX_BODY = 2000

/** Each kind's look -- the Mini App and the bot paint them the same way: news blue, events violet, notices amber. */
const KIND: Record<
  AnnouncementKind,
  { label: string; hint: string; icon: LucideIcon; bar: string; chip: string; tile: string; picked: string }
> = {
  NEWS: {
    label: 'Yangilik',
    hint: 'Markaz hayotidan xabar',
    icon: Newspaper,
    bar: 'bg-sky-500',
    chip: 'bg-sky-50 text-sky-700 ring-sky-600/20 dark:bg-sky-500/10 dark:text-sky-300 dark:ring-sky-400/20',
    tile: 'bg-sky-100 text-sky-600 dark:bg-sky-500/15 dark:text-sky-300',
    picked: 'border-sky-500 bg-sky-50 dark:bg-sky-500/10',
  },
  EVENT: {
    label: 'Tadbir',
    hint: 'Sanasi va vaqti bor tadbir',
    icon: PartyPopper,
    bar: 'bg-violet-500',
    chip: 'bg-violet-50 text-violet-700 ring-violet-600/20 dark:bg-violet-500/10 dark:text-violet-300 dark:ring-violet-400/20',
    tile: 'bg-violet-100 text-violet-600 dark:bg-violet-500/15 dark:text-violet-300',
    picked: 'border-violet-500 bg-violet-50 dark:bg-violet-500/10',
  },
  ORGANIZATIONAL: {
    label: 'Tashkiliy',
    hint: 'Yigʻim, qoida yoki muhim eslatma',
    icon: Megaphone,
    bar: 'bg-amber-500',
    chip: 'bg-amber-50 text-amber-700 ring-amber-600/20 dark:bg-amber-500/10 dark:text-amber-300 dark:ring-amber-400/20',
    tile: 'bg-amber-100 text-amber-600 dark:bg-amber-500/15 dark:text-amber-300',
    picked: 'border-amber-500 bg-amber-50 dark:bg-amber-500/10',
  },
}

const KINDS = Object.keys(KIND) as AnnouncementKind[]

type Filter = 'ALL' | AnnouncementKind

export function AnnouncementsPage() {
  const queryClient = useQueryClient()
  const [filter, setFilter] = useState<Filter>('ALL')
  const [creating, setCreating] = useState(false)
  const list = useQuery({ queryKey: ['announcements'], queryFn: announcementsApi.list })

  const removeMutation = useMutation({
    mutationFn: (id: string) => announcementsApi.remove(id),
    onSuccess: () => {
      notifySuccess('Eʼlon oʻchirildi')
      queryClient.invalidateQueries({ queryKey: ['announcements'] })
    },
    onError: (err) => notifyError(err, 'Eʼlonni oʻchirib boʻlmadi'),
  })

  const shown = (list.data ?? []).filter((a) => filter === 'ALL' || a.kind === filter)

  return (
    <>
      <PageHeader
        title="Eʼlonlar"
        description="Yangiliklar, tadbirlar va tashkiliy eʼlonlar — oʻquvchilar ilovasining bosh sahifasida chiqadi va botga yuboriladi."
        actions={
          <Button onClick={() => setCreating(true)}>
            <Plus className="h-4 w-4" />
            Yangi eʼlon
          </Button>
        }
      />

      <div className="mb-4">
        <Tabs<Filter>
          tabs={[
            { key: 'ALL', label: 'Hammasi' },
            ...KINDS.map((kind) => ({ key: kind, label: KIND[kind].label, icon: KIND[kind].icon })),
          ]}
          active={filter}
          onChange={setFilter}
        />
      </div>

      {list.isLoading ? (
        <Spinner />
      ) : list.error ? (
        <ErrorBanner message="Eʼlonlarni yuklab boʻlmadi" />
      ) : shown.length === 0 ? (
        <Card>
          <EmptyState
            title={filter === 'ALL' ? 'Hali eʼlon yoʻq' : `${KIND[filter].label} turidagi eʼlon yoʻq`}
            description="Yangi eʼlon yarating — u tanlangan guruhlar oʻquvchilariga yuboriladi."
          />
        </Card>
      ) : (
        <div className="space-y-4">
          {shown.map((announcement) => (
            <AnnouncementCard
              key={announcement.id}
              announcement={announcement}
              deleting={removeMutation.isPending && removeMutation.variables === announcement.id}
              onDelete={() => {
                if (window.confirm('Eʼlon oʻchirilsinmi? U ilovadan va (Telegram ruxsat bersa) bot chatlaridan ham olib tashlanadi.')) {
                  removeMutation.mutate(announcement.id)
                }
              }}
            />
          ))}
        </div>
      )}

      {creating && (
        <AnnouncementFormModal
          onClose={() => setCreating(false)}
          onSent={() => {
            setCreating(false)
            queryClient.invalidateQueries({ queryKey: ['announcements'] })
          }}
        />
      )}
    </>
  )
}

function KindChip({ kind }: { kind: AnnouncementKind }) {
  const look = KIND[kind]
  return (
    <span className={`inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset ${look.chip}`}>
      <look.icon className="h-3.5 w-3.5" />
      {look.label}
    </span>
  )
}

const metaChip =
  'inline-flex items-center gap-1 rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-600 dark:bg-slate-800 dark:text-slate-300'

function AnnouncementCard({
  announcement: a,
  deleting,
  onDelete,
}: {
  announcement: Announcement
  deleting: boolean
  onDelete: () => void
}) {
  const [expanded, setExpanded] = useState(false)
  const [viewing, setViewing] = useState(false)
  const look = KIND[a.kind]
  const long = a.body.length > 220 || a.body.split('\n').length > 3

  return (
    <Card className="overflow-hidden">
      <div className="flex">
        <div className={`w-1.5 shrink-0 ${look.bar}`} />
        <div className="min-w-0 flex-1 p-4 sm:p-5">
          <div className="flex items-start gap-4">
            <div className={`hidden h-11 w-11 shrink-0 items-center justify-center rounded-xl sm:flex ${look.tile}`}>
              <look.icon className="h-5 w-5" />
            </div>
            <div className="min-w-0 flex-1">
              <div className="flex flex-wrap items-center gap-1.5">
                <KindChip kind={a.kind} />
                {a.eventAt && (
                  <span className={metaChip}>
                    <CalendarDays className="h-3.5 w-3.5" />
                    {formatDayMonthWeekday(a.eventAt)}, {formatTime(a.eventAt)}
                  </span>
                )}
                {a.amount != null && (
                  <span className={metaChip}>
                    <Coins className="h-3.5 w-3.5" />
                    {formatMoney(a.amount)}
                  </span>
                )}
              </div>
              <h3 className="mt-2 text-base font-semibold text-slate-900 dark:text-slate-100">{a.title}</h3>
              <p
                className={`mt-1 whitespace-pre-line text-sm text-slate-600 dark:text-slate-400 ${
                  long && !expanded ? 'line-clamp-3' : ''
                }`}
              >
                {a.body}
              </p>
              {long && (
                <button
                  onClick={() => setExpanded((e) => !e)}
                  className="mt-1 text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
                >
                  {expanded ? 'Qisqartirish' : 'Toʻliq oʻqish'}
                </button>
              )}
            </div>
            {a.image && (
              <button onClick={() => setViewing(true)} className="shrink-0" aria-label="Rasmni kattalashtirish">
                <AnnouncementImage id={a.id} className="h-20 w-24 rounded-lg object-cover sm:h-24 sm:w-36" />
              </button>
            )}
          </div>

          <div className="mt-3 flex flex-wrap gap-1.5">
            {a.groups.map((g) => (
              <span key={g.id} className="rounded-full px-2 py-0.5 text-xs font-medium" style={levelStyles(g.levelColor).soft}>
                {g.name}
              </span>
            ))}
          </div>

          <div className="mt-3 flex flex-wrap items-center justify-between gap-2 border-t border-slate-100 pt-3 dark:border-slate-800">
            <span className="flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
              <span className="font-medium text-slate-700 dark:text-slate-300">{a.authorName}</span>
              <span>·</span>
              <span>
                {formatDate(a.createdAt)}, {formatTime(a.createdAt)}
              </span>
              <span>·</span>
              <span className="inline-flex items-center gap-1">
                <Send className="h-3 w-3" />
                {a.sentMessages > 0 ? `${a.sentMessages} ta xabar yuborildi` : 'Botga yuborilmadi'}
              </span>
            </span>
            {a.canDelete && (
              <Button variant="danger" size="sm" loading={deleting} onClick={onDelete}>
                <Trash2 className="h-3.5 w-3.5" />
                Oʻchirish
              </Button>
            )}
          </div>
        </div>
      </div>

      {viewing && (
        <div
          className="fixed inset-0 z-50 flex items-center justify-center bg-slate-950/90 p-4"
          onClick={() => setViewing(false)}
        >
          <button
            aria-label="Yopish"
            className="absolute right-4 top-4 rounded-lg bg-white/10 p-2 text-white hover:bg-white/20"
          >
            <X className="h-5 w-5" />
          </button>
          <AnnouncementImage id={a.id} className="max-h-full max-w-full rounded-lg object-contain" />
        </div>
      )}
    </Card>
  )
}

/** A stored announcement picture -- fetched with the login cookie, then shown from memory. */
function AnnouncementImage({ id, className }: { id: string; className?: string }) {
  const [src, setSrc] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  useEffect(() => {
    let live = true
    announcementsApi
      .imageUrl(id)
      .then((url) => live && setSrc(url))
      .catch(() => live && setFailed(true))
    return () => {
      live = false
    }
  }, [id])
  if (src) return <img src={src} alt="" className={className} draggable={false} />
  return (
    <span className={`flex items-center justify-center bg-slate-100 text-xs text-slate-400 dark:bg-slate-800 ${className}`}>
      {failed ? 'Rasm yuklanmadi' : <Loader2 className="h-4 w-4 animate-spin" />}
    </span>
  )
}

/** A picked picture: shrunk for upload, with a preview. */
type PickedImage = { dataUrl: string; preview: string }

function AnnouncementFormModal({ onClose, onSent }: { onClose: () => void; onSent: () => void }) {
  const groups = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const [kind, setKind] = useState<AnnouncementKind>('NEWS')
  const [title, setTitle] = useState('')
  const [body, setBody] = useState('')
  const [eventAt, setEventAt] = useState('')
  const [amount, setAmount] = useState(0)
  const [groupIds, setGroupIds] = useState<Set<string>>(new Set())
  const [image, setImage] = useState<PickedImage | null>(null)
  const [preparingImage, setPreparingImage] = useState(false)
  const fileInput = useRef<HTMLInputElement>(null)

  // A replaced (or the last) preview's object URL is let go.
  useEffect(() => {
    if (!image) return
    return () => URL.revokeObjectURL(image.preview)
  }, [image])

  const allGroups = groups.data ?? []
  const allPicked = allGroups.length > 0 && allGroups.every((g) => groupIds.has(g.id))

  async function pickImage(file: File | undefined) {
    if (!file || !file.type.startsWith('image/')) return
    setPreparingImage(true)
    try {
      const blob = await shrinkPhoto(file)
      setImage({ dataUrl: await blobToDataUrl(blob), preview: URL.createObjectURL(blob) })
    } catch {
      notifyError(null, 'Rasmni oʻqib boʻlmadi')
    } finally {
      setPreparingImage(false)
    }
  }

  function toggleGroup(id: string) {
    setGroupIds((current) => {
      const next = new Set(current)
      if (next.has(id)) next.delete(id)
      else next.add(id)
      return next
    })
  }

  const sendMutation = useMutation({
    mutationFn: () =>
      announcementsApi.create({
        kind,
        title,
        body,
        eventAt: kind === 'EVENT' && eventAt ? new Date(eventAt).toISOString() : null,
        amount: kind === 'ORGANIZATIONAL' && amount > 0 ? amount : null,
        groupIds: [...groupIds],
        image: image?.dataUrl ?? null,
      }),
    onSuccess: (sent) => {
      notifySuccess(
        sent.notifiedChats > 0 ? `Eʼlon yuborildi — ${sent.notifiedChats} ta Telegram chatga` : 'Eʼlon ilovada chiqdi',
      )
      onSent()
    },
    onError: (err) => notifyError(err, 'Eʼlonni yuborib boʻlmadi'),
  })

  const ready =
    title.trim() && body.trim() && groupIds.size > 0 && (kind !== 'EVENT' || eventAt) && !preparingImage

  function handleSubmit(e: FormEvent) {
    e.preventDefault()
    if (ready) sendMutation.mutate()
  }

  return (
    <Modal title="Yangi eʼlon" onClose={onClose} size="lg">
      <form onSubmit={handleSubmit} className="space-y-5">
        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Turi</span>
          <div className="grid grid-cols-3 gap-2">
            {KINDS.map((k) => {
              const look = KIND[k]
              const picked = k === kind
              return (
                <button
                  type="button"
                  key={k}
                  onClick={() => setKind(k)}
                  className={`flex flex-col items-center gap-1.5 rounded-xl border-2 px-2 py-3 text-center transition-colors ${
                    picked
                      ? look.picked
                      : 'border-slate-200 hover:border-slate-300 dark:border-slate-700 dark:hover:border-slate-600'
                  }`}
                >
                  <span className={`flex h-9 w-9 items-center justify-center rounded-lg ${look.tile}`}>
                    <look.icon className="h-5 w-5" />
                  </span>
                  <span className="text-sm font-semibold text-slate-900 dark:text-slate-100">{look.label}</span>
                  <span className="hidden text-[11px] leading-tight text-slate-500 sm:block dark:text-slate-400">{look.hint}</span>
                </button>
              )
            })}
          </div>
        </div>

        <Field label="Sarlavha">
          <Input
            value={title}
            onChange={(e) => setTitle(e.target.value)}
            maxLength={MAX_TITLE}
            placeholder={
              kind === 'EVENT'
                ? 'Masalan: Yangi yil bayrami'
                : kind === 'ORGANIZATIONAL'
                  ? 'Masalan: Yangi doska uchun yigʻim'
                  : 'Masalan: Markazimizda yangi kutubxona'
            }
          />
        </Field>

        <Field label="Matn">
          <Textarea
            value={body}
            onChange={(e) => setBody(e.target.value)}
            maxLength={MAX_BODY}
            rows={5}
            placeholder="Oʻquvchilar va ota-onalar uchun batafsil maʼlumot…"
          />
          <span className="mt-1 block text-right text-xs text-slate-400">
            {body.length} / {MAX_BODY}
          </span>
        </Field>

        {kind === 'EVENT' && (
          <Field label="Tadbir sanasi va vaqti">
            <Input type="datetime-local" value={eventAt} onChange={(e) => setEventAt(e.target.value)} />
          </Field>
        )}

        {kind === 'ORGANIZATIONAL' && (
          <Field label="Har bir oʻquvchidan (ixtiyoriy)">
            <MoneyInput value={amount} onChange={setAmount} placeholder="Yigʻim boʻlmasa, boʻsh qoldiring" />
          </Field>
        )}

        <div>
          <span className="mb-1.5 block text-sm font-medium text-slate-700 dark:text-slate-300">Rasm (ixtiyoriy)</span>
          <input
            ref={fileInput}
            type="file"
            accept="image/jpeg,image/png,image/webp"
            className="hidden"
            onChange={(e) => {
              pickImage(e.target.files?.[0])
              e.target.value = ''
            }}
          />
          {image ? (
            <div className="relative overflow-hidden rounded-xl border border-slate-200 dark:border-slate-700">
              <img src={image.preview} alt="" className="max-h-64 w-full object-cover" />
              <button
                type="button"
                onClick={() => setImage(null)}
                aria-label="Rasmni olib tashlash"
                className="absolute right-2 top-2 rounded-lg bg-slate-900/70 p-1.5 text-white hover:bg-slate-900/90"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          ) : (
            <button
              type="button"
              onClick={() => fileInput.current?.click()}
              disabled={preparingImage}
              className="flex w-full flex-col items-center gap-1.5 rounded-xl border-2 border-dashed border-slate-300 px-4 py-6 text-sm text-slate-500 hover:border-brand-400 hover:text-brand-600 dark:border-slate-700 dark:text-slate-400 dark:hover:border-brand-500 dark:hover:text-brand-400"
            >
              {preparingImage ? <Loader2 className="h-6 w-6 animate-spin" /> : <ImagePlus className="h-6 w-6" />}
              Rasm tanlash
            </button>
          )}
        </div>

        <div>
          <div className="mb-1.5 flex items-center justify-between gap-2">
            <span className="text-sm font-medium text-slate-700 dark:text-slate-300">Kimlarga</span>
            {allGroups.length > 0 && (
              <button
                type="button"
                onClick={() => setGroupIds(allPicked ? new Set() : new Set(allGroups.map((g) => g.id)))}
                className="text-xs font-medium text-brand-600 hover:underline dark:text-brand-400"
              >
                {allPicked ? 'Hammasini olib tashlash' : 'Barcha guruhlar'}
              </button>
            )}
          </div>
          {groups.isLoading ? (
            <Spinner />
          ) : allGroups.length === 0 ? (
            <p className="text-sm text-slate-500 dark:text-slate-400">Sizda guruh yoʻq.</p>
          ) : (
            <div className="flex flex-wrap gap-2">
              {allGroups.map((g) => {
                const picked = groupIds.has(g.id)
                const color = levelStyles(g.level?.color)
                return (
                  <button
                    type="button"
                    key={g.id}
                    onClick={() => toggleGroup(g.id)}
                    className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-sm font-medium transition-colors ${
                      picked ? '' : 'bg-white text-slate-600 ring-1 ring-inset ring-slate-200 hover:bg-slate-50 dark:bg-slate-900 dark:text-slate-300 dark:ring-slate-700 dark:hover:bg-slate-800'
                    }`}
                    style={picked ? color.solid : undefined}
                  >
                    {!picked && <span className="h-2 w-2 rounded-full" style={color.fill} />}
                    {g.name}
                    <span className={`text-xs ${picked ? 'text-white/80' : 'text-slate-400'}`}>
                      {g.enrollments?.length ?? 0}
                    </span>
                  </button>
                )
              })}
            </div>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-100 pt-4 dark:border-slate-800">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" disabled={!ready} loading={sendMutation.isPending}>
            <Send className="h-4 w-4" />
            {groupIds.size > 0 ? `Yuborish · ${groupIds.size} ta guruh` : 'Yuborish'}
          </Button>
        </div>
      </form>
    </Modal>
  )
}
