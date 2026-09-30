import { useEffect, useLayoutEffect, useMemo, useRef, useState, type KeyboardEvent } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import {
  ArrowLeft,
  Check,
  CheckCheck,
  ExternalLink,
  Loader2,
  MessageCircle,
  Phone,
  Search,
  SendHorizontal,
  X,
} from 'lucide-react'
import { ApiError, conversations } from '../../lib/api'
import { useChat } from '../../lib/chat'
import { ageFrom, dayMonthYearLabel, formatDayMonth, formatTime, initials } from '../../lib/format'
import { notifyError } from '../../lib/toast'
import type { ChatMessage, ChatStudent, ConversationListItem, ConversationThread } from '../../lib/types'
import { Tabs } from '../ui'

const LIST_POLL_MS = 10_000
const THREAD_POLL_MS = 5_000
const MAX_LENGTH = 2000

type Filter = 'all' | 'unread'

/**
 * The family chat window, Telegram-style: conversations on the left (all / unread), the chosen
 * student's thread on the right with who they are, and a composer whose messages go to the
 * student's Telegram bot. On narrow screens it shows one pane at a time.
 */
export function ChatModal() {
  const chat = useChat()
  const [filter, setFilter] = useState<Filter>('all')
  const [search, setSearch] = useState('')

  const list = useQuery({
    queryKey: ['conversations', 'list'],
    queryFn: conversations.list,
    refetchInterval: LIST_POLL_MS,
  })

  useEffect(() => {
    const onKey = (e: globalThis.KeyboardEvent) => e.key === 'Escape' && chat.close()
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [chat])

  const rows = useMemo(() => {
    const q = search.trim().toLowerCase()
    return (list.data ?? [])
      .filter((c) => filter === 'all' || c.unread > 0)
      .filter(
        (c) =>
          !q ||
          `${c.student.firstName} ${c.student.lastName}`.toLowerCase().includes(q) ||
          c.student.groups.some((g) => g.name.toLowerCase().includes(q)),
      )
  }, [list.data, filter, search])
  const unreadThreads = (list.data ?? []).filter((c) => c.unread > 0).length

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-0 backdrop-blur-[2px] sm:p-4 dark:bg-slate-950/70"
      onMouseDown={(e) => e.target === e.currentTarget && chat.close()}
    >
      <div
        role="dialog"
        aria-label="Ota-onalar bilan muloqot"
        className="flex h-full w-full max-w-6xl overflow-hidden bg-white shadow-2xl sm:h-[min(780px,92vh)] sm:rounded-2xl dark:bg-slate-900 dark:ring-1 dark:ring-slate-800"
      >
        <aside
          className={`w-full flex-col border-slate-200 md:flex md:w-[340px] md:shrink-0 md:border-r dark:border-slate-800 ${
            chat.studentId ? 'hidden' : 'flex'
          }`}
        >
          <div className="flex items-center justify-between px-4 pb-3 pt-4">
            <div>
              <h2 className="text-lg font-semibold text-slate-900 dark:text-slate-100">Xabarlar</h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">Ota-onalar bilan muloqot</p>
            </div>
            <button
              onClick={chat.close}
              className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 md:hidden dark:hover:bg-slate-800"
              aria-label="Yopish"
            >
              <X className="h-5 w-5" />
            </button>
          </div>
          <div className="space-y-3 px-4 pb-3">
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Oʻquvchi yoki guruh…"
                className="w-full rounded-full border-0 bg-slate-100 py-2 pl-9 pr-3 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:bg-slate-800 dark:text-slate-100"
              />
            </div>
            <Tabs
              variant="segmented"
              size="xs"
              active={filter}
              onChange={setFilter}
              tabs={[
                { key: 'all', label: 'Hammasi' },
                { key: 'unread', label: unreadThreads ? `Oʻqilmagan · ${unreadThreads}` : 'Oʻqilmagan' },
              ]}
            />
          </div>
          <div className="min-h-0 flex-1 overflow-y-auto border-t border-slate-100 dark:border-slate-800">
            {list.isLoading ? (
              <div className="flex justify-center py-10">
                <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
              </div>
            ) : rows.length === 0 ? (
              <p className="px-6 py-10 text-center text-sm text-slate-500 dark:text-slate-400">
                {search
                  ? 'Hech narsa topilmadi'
                  : filter === 'unread'
                    ? 'Hammasi oʻqilgan 🎉'
                    : 'Hali xabarlar yoʻq. Ota-onalar botga yozganda shu yerda paydo boʻladi.'}
              </p>
            ) : (
              rows.map((c) => (
                <ConversationRow key={c.studentId} item={c} active={c.studentId === chat.studentId} onClick={() => chat.select(c.studentId)} />
              ))
            )}
          </div>
        </aside>

        <section className={`min-w-0 flex-1 flex-col ${chat.studentId ? 'flex' : 'hidden md:flex'}`}>
          {chat.studentId ? (
            <Thread key={chat.studentId} studentId={chat.studentId} />
          ) : (
            <div className="relative flex flex-1 flex-col items-center justify-center gap-3 bg-slate-50 px-8 text-center dark:bg-slate-950/40">
              <CloseButton className="absolute right-3 top-3" />
              <span className="flex h-16 w-16 items-center justify-center rounded-full bg-brand-50 text-brand-600 dark:bg-brand-500/10 dark:text-brand-300">
                <MessageCircle className="h-8 w-8" />
              </span>
              <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Suhbatni tanlang</p>
              <p className="max-w-xs text-sm text-slate-500 dark:text-slate-400">
                Ota-onalar botda yoki ilovada «Oʻqituvchi bilan muloqot» orqali yozadi. Javobingiz ularning Telegramiga boradi.
              </p>
            </div>
          )}
        </section>
      </div>
    </div>
  )
}

function CloseButton({ className = '' }: { className?: string }) {
  const chat = useChat()
  return (
    <button
      onClick={chat.close}
      className={`rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600 dark:hover:bg-slate-800 dark:hover:text-slate-300 ${className}`}
      aria-label="Yopish"
    >
      <X className="h-5 w-5" />
    </button>
  )
}

function Avatar({ student, size = 'md' }: { student: ChatStudent; size?: 'sm' | 'md' }) {
  // Painted in the student's level color, like their group everywhere else in the panel.
  const color = student.groups[0]?.levelColor
  return (
    <span
      className={`flex shrink-0 items-center justify-center rounded-full font-semibold text-white ${
        size === 'sm' ? 'h-10 w-10 text-sm' : 'h-11 w-11 text-sm'
      } ${color ? '' : 'bg-slate-400 dark:bg-slate-600'}`}
      style={color ? { backgroundColor: color } : undefined}
    >
      {initials(`${student.firstName} ${student.lastName}`)}
    </span>
  )
}

/** "14:05" today, "Kecha" yesterday, "28.09" before that -- like Telegram's list. */
function listTime(value: string): string {
  const date = new Date(value)
  const today = new Date()
  const days = Math.round((startOfDay(today) - startOfDay(date)) / 86_400_000)
  if (days === 0) return formatTime(date)
  if (days === 1) return 'Kecha'
  return formatDayMonth(date)
}

function startOfDay(date: Date): number {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate()).getTime()
}

function ConversationRow({ item, active, onClick }: { item: ConversationListItem; active: boolean; onClick: () => void }) {
  const { student, lastMessage, unread } = item
  return (
    <button
      type="button"
      onClick={onClick}
      className={`flex w-full items-center gap-3 px-4 py-3 text-left transition-colors ${
        active ? 'bg-brand-50 dark:bg-brand-500/10' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
      }`}
    >
      <Avatar student={student} />
      <div className="min-w-0 flex-1">
        <div className="flex items-baseline justify-between gap-2">
          <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
            {student.firstName} {student.lastName}
          </p>
          {lastMessage && (
            <span className={`shrink-0 text-xs ${unread ? 'font-semibold text-brand-600 dark:text-brand-300' : 'text-slate-400'}`}>
              {listTime(lastMessage.createdAt)}
            </span>
          )}
        </div>
        <p className="truncate text-xs text-slate-400 dark:text-slate-500">
          Ota-onasi{student.groups.length > 0 && ` · ${student.groups.map((g) => g.name).join(', ')}`}
        </p>
        <div className="mt-0.5 flex items-center justify-between gap-2">
          <p className={`truncate text-sm ${unread ? 'text-slate-800 dark:text-slate-200' : 'text-slate-500 dark:text-slate-400'}`}>
            {lastMessage?.sender === 'STAFF' && <span className="text-brand-600 dark:text-brand-300">Siz: </span>}
            {lastMessage?.text}
          </p>
          {unread > 0 && (
            <span className="flex h-5 min-w-5 shrink-0 items-center justify-center rounded-full bg-brand-600 px-1.5 text-[11px] font-bold tabular-nums text-white">
              {unread}
            </span>
          )}
        </div>
      </div>
    </button>
  )
}

function Thread({ studentId }: { studentId: string }) {
  const chat = useChat()
  const queryClient = useQueryClient()
  const thread = useQuery({
    queryKey: ['conversations', 'thread', studentId],
    queryFn: () => conversations.thread(studentId),
    refetchInterval: THREAD_POLL_MS,
  })

  // Opening the thread marks it read server-side -- refresh the list and the badge to match.
  const messageCount = thread.data?.messages.length
  useEffect(() => {
    if (messageCount === undefined) return
    queryClient.invalidateQueries({ queryKey: ['conversations', 'unread'] })
    queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] })
  }, [messageCount, queryClient])

  if (thread.isLoading) {
    return (
      <div className="flex flex-1 items-center justify-center">
        <Loader2 className="h-5 w-5 animate-spin text-slate-400" />
      </div>
    )
  }
  if (thread.error || !thread.data) {
    const forbidden = thread.error instanceof ApiError && thread.error.statusCode === 403
    return (
      <div className="relative flex flex-1 flex-col items-center justify-center gap-3 px-8 text-center">
        <CloseButton className="absolute right-3 top-3" />
        <p className="text-sm text-slate-600 dark:text-slate-400">
          {forbidden ? 'Bu oʻquvchi sizning guruhlaringizda emas.' : 'Suhbatni yuklab boʻlmadi.'}
        </p>
        <button onClick={() => chat.select(null)} className="text-sm font-medium text-brand-600 hover:underline">
          Roʻyxatga qaytish
        </button>
      </div>
    )
  }

  return (
    <>
      <ThreadHeader data={thread.data} />
      <Messages data={thread.data} />
      <Composer studentId={studentId} linkedChats={thread.data.linkedChats} />
    </>
  )
}

function ThreadHeader({ data }: { data: ConversationThread }) {
  const chat = useChat()
  const { student, linkedChats } = data
  const age = ageFrom(student.dob)
  return (
    <header className="flex items-center gap-3 border-b border-slate-200 px-4 py-3 dark:border-slate-800">
      <button
        onClick={() => chat.select(null)}
        className="rounded-lg p-1.5 text-slate-500 hover:bg-slate-100 md:hidden dark:hover:bg-slate-800"
        aria-label="Orqaga"
      >
        <ArrowLeft className="h-5 w-5" />
      </button>
      <Avatar student={student} size="sm" />
      <div className="min-w-0 flex-1">
        <p className="truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
          {student.firstName} {student.lastName}
          <span className="ml-2 font-normal text-slate-400">· ota-onasi</span>
        </p>
        <div className="mt-0.5 flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-slate-500 dark:text-slate-400">
          {age !== null && <span>{age} yosh</span>}
          {student.phone && (
            <a href={`tel:${student.phone.replace(/[^\d+]/g, '')}`} className="inline-flex items-center gap-1 hover:text-brand-600">
              <Phone className="h-3 w-3" />
              {student.phone}
            </a>
          )}
          {student.groups.map((g) => (
            <span key={g.id} className="inline-flex items-center gap-1.5">
              <span className="h-2 w-2 rounded-full" style={{ backgroundColor: g.levelColor }} />
              {g.name} · {g.level}
            </span>
          ))}
          {student.groups.length === 0 && <span>Faol guruhi yoʻq</span>}
          <span>{linkedChats} ta Telegram</span>
        </div>
      </div>
      <Link
        to={`/students/${student.id}`}
        onClick={chat.close}
        className="hidden items-center gap-1.5 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-medium text-slate-700 hover:bg-slate-50 sm:inline-flex dark:border-slate-700 dark:text-slate-300 dark:hover:bg-slate-800"
      >
        <ExternalLink className="h-3.5 w-3.5" />
        Profil
      </Link>
      <CloseButton />
    </header>
  )
}

/** Day label for the separators between messages: "Bugun", "Kecha", or "28-sentabr, 2026". */
function dayLabel(date: Date): string {
  const days = Math.round((startOfDay(new Date()) - startOfDay(date)) / 86_400_000)
  if (days === 0) return 'Bugun'
  if (days === 1) return 'Kecha'
  return dayMonthYearLabel(date)
}

/** A run of consecutive messages from one person within a few minutes, drawn as one tight block. */
const GROUP_GAP_MS = 5 * 60_000

function Messages({ data }: { data: ConversationThread }) {
  const scrollRef = useRef<HTMLDivElement>(null)
  const last = data.messages.at(-1)?.id

  // Keep the newest message in view when the thread opens or a message arrives.
  useLayoutEffect(() => {
    const el = scrollRef.current
    if (el) el.scrollTop = el.scrollHeight
  }, [last])

  const familyReadAt = data.familyReadAt ? new Date(data.familyReadAt).getTime() : 0

  return (
    <div
      ref={scrollRef}
      className="min-h-0 flex-1 overflow-y-auto bg-slate-50 px-4 py-4 sm:px-8 dark:bg-slate-950/40"
    >
      {data.messages.length === 0 ? (
        <div className="flex h-full flex-col items-center justify-center gap-2 text-center">
          <p className="text-sm font-medium text-slate-600 dark:text-slate-300">Hali xabar yoʻq</p>
          <p className="max-w-xs text-sm text-slate-400 dark:text-slate-500">
            Birinchi boʻlib yozing — xabar oʻquvchi va ota-onasining Telegramiga boradi.
          </p>
        </div>
      ) : (
        <div className="mx-auto flex max-w-3xl flex-col">
          {data.messages.map((m, i) => {
            const prev = data.messages[i - 1]
            const date = new Date(m.createdAt)
            const newDay = !prev || startOfDay(new Date(prev.createdAt)) !== startOfDay(date)
            const continues =
              !newDay &&
              prev.sender === m.sender &&
              prev.senderName === m.senderName &&
              date.getTime() - new Date(prev.createdAt).getTime() < GROUP_GAP_MS
            return (
              <div key={m.id}>
                {newDay && (
                  <div className="my-3 flex justify-center">
                    <span className="rounded-full bg-white/90 px-3 py-1 text-xs font-medium text-slate-500 shadow-sm ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-400 dark:ring-slate-700">
                      {dayLabel(date)}
                    </span>
                  </div>
                )}
                <Bubble message={m} showName={!continues} seen={date.getTime() <= familyReadAt} />
              </div>
            )
          })}
        </div>
      )}
    </div>
  )
}

function Bubble({ message, showName, seen }: { message: ChatMessage; showName: boolean; seen: boolean }) {
  const staff = message.sender === 'STAFF'
  return (
    <div className={`flex ${staff ? 'justify-end' : 'justify-start'} ${showName ? 'mt-3' : 'mt-0.5'}`}>
      <div
        className={`max-w-[75%] rounded-2xl px-3.5 py-2 shadow-sm ${
          staff
            ? 'rounded-br-md bg-brand-600 text-white'
            : 'rounded-bl-md bg-white text-slate-800 ring-1 ring-slate-200 dark:bg-slate-800 dark:text-slate-100 dark:ring-slate-700'
        }`}
      >
        {showName && (
          <p className={`mb-0.5 text-xs font-semibold ${staff ? 'text-brand-100' : 'text-brand-600 dark:text-brand-300'}`}>
            {message.senderName}
          </p>
        )}
        <p className="whitespace-pre-wrap break-words text-sm leading-relaxed">{message.text}</p>
        <p className={`mt-0.5 flex items-center justify-end gap-1 text-[11px] ${staff ? 'text-brand-100' : 'text-slate-400'}`}>
          {formatTime(message.createdAt)}
          {staff &&
            (seen ? (
              <CheckCheck className="h-3.5 w-3.5" aria-label="Ilovada koʻrildi" />
            ) : (
              <Check className="h-3.5 w-3.5" aria-label="Telegramga yuborildi" />
            ))}
        </p>
      </div>
    </div>
  )
}

function Composer({ studentId, linkedChats }: { studentId: string; linkedChats: number }) {
  const queryClient = useQueryClient()
  const [text, setText] = useState('')
  const inputRef = useRef<HTMLTextAreaElement>(null)

  useEffect(() => {
    inputRef.current?.focus()
  }, [])

  // Grows with the text up to a few lines, like Telegram's input.
  useLayoutEffect(() => {
    const el = inputRef.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 160)}px`
  }, [text])

  const send = useMutation({
    mutationFn: (value: string) => conversations.send(studentId, value),
    onSuccess: (message) => {
      setText('')
      queryClient.setQueryData<ConversationThread>(['conversations', 'thread', studentId], (old) =>
        old ? { ...old, messages: [...old.messages, message] } : old,
      )
      queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] })
    },
    onError: (err) => notifyError(err, 'Xabarni yuborib boʻlmadi'),
  })

  const submit = () => {
    const value = text.trim()
    if (!value || send.isPending) return
    send.mutate(value)
  }
  const onKeyDown = (e: KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
      e.preventDefault()
      submit()
    }
  }

  if (linkedChats === 0) {
    return (
      <div className="border-t border-slate-200 px-4 py-4 text-center text-sm text-slate-500 dark:border-slate-800 dark:text-slate-400">
        Oʻquvchi hali Telegram botga ulanmagan — yozish uchun avval profilidan kod bering.
      </div>
    )
  }

  return (
    <div className="border-t border-slate-200 px-4 py-3 dark:border-slate-800">
      <div className="mx-auto flex max-w-3xl items-end gap-2">
        <textarea
          ref={inputRef}
          rows={1}
          value={text}
          maxLength={MAX_LENGTH}
          onChange={(e) => setText(e.target.value)}
          onKeyDown={onKeyDown}
          placeholder="Xabar yozing…"
          className="max-h-40 min-h-[42px] flex-1 resize-none rounded-2xl border-0 bg-slate-100 px-4 py-2.5 text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:ring-2 focus:ring-brand-500/40 dark:bg-slate-800 dark:text-slate-100"
        />
        <button
          type="button"
          onClick={submit}
          disabled={!text.trim() || send.isPending}
          aria-label="Yuborish"
          className="flex h-[42px] w-[42px] shrink-0 items-center justify-center rounded-full bg-brand-600 text-white transition hover:bg-brand-700 disabled:cursor-not-allowed disabled:opacity-40"
        >
          {send.isPending ? <Loader2 className="h-4 w-4 animate-spin" /> : <SendHorizontal className="h-4 w-4" />}
        </button>
      </div>
      <p className="mx-auto mt-1.5 max-w-3xl px-1 text-[11px] text-slate-400 dark:text-slate-500">
        Enter — yuborish, Shift+Enter — yangi qator. Xabar {linkedChats} ta Telegram hisobiga boradi.
      </p>
    </div>
  )
}
