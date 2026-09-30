import { useEffect, useLayoutEffect, useRef, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Loader2, Phone, SendHorizontal } from 'lucide-react'
import { formatTime, telHref } from '../../lib/format'
import { miniApi } from '../api'
import { haptic } from '../telegram'
import { ErrorState, Loading } from '../components/kit'
import { MONTHS, initialsOf } from '../format'
import type { MiniChat, MiniChatMessage } from '../types'

const POLL_MS = 5_000
const MAX_LENGTH = 2000

/** Ready-made openers for what parents write about most -- a tap puts the text in the box. */
const SUGGESTIONS = ['Bugun darsga kela olmaydi', 'Uyga vazifa nima edi?', 'Toʻlov haqida savolim bor']

/**
 * Oʻqituvchi bilan muloqot: the family's thread with the teacher. What is written here (or in the
 * bot) reaches the teacher's panel; answers arrive here and as a bot message. No bottom bar on this
 * screen -- the composer sits there instead.
 */
export function ChatPage() {
  const queryClient = useQueryClient()
  const chat = useQuery({ queryKey: ['mini', 'chat'], queryFn: miniApi.chat, refetchInterval: POLL_MS })
  const [text, setText] = useState('')

  const send = useMutation({
    mutationFn: miniApi.sendChat,
    onSuccess: (message) => {
      haptic('success')
      setText('')
      queryClient.setQueryData<MiniChat>(['mini', 'chat'], (old) => (old ? { ...old, messages: [...old.messages, message] } : old))
    },
    onError: () => haptic('error'),
  })
  // Loading the chat marks the teacher's answers seen -- the home screen's badge goes with it.
  const messageCount = chat.data?.messages.length
  useEffect(() => {
    if (messageCount !== undefined) queryClient.invalidateQueries({ queryKey: ['mini', 'home'] })
  }, [messageCount, queryClient])

  if (chat.isLoading) return <Loading />
  if (chat.error || !chat.data) {
    return (
      <div className="px-[18px] pt-5">
        <ErrorState error={chat.error} onRetry={() => chat.refetch()} />
      </div>
    )
  }

  const { teacher, messages } = chat.data
  const submit = () => {
    const value = text.trim()
    if (value && !send.isPending) send.mutate(value)
  }

  return (
    <div className="flex min-h-[calc(100vh-7rem)] flex-col">
      <header className="sticky top-0 z-10 flex items-center gap-3 border-b-2 border-tg-line bg-tg-cream/95 px-[18px] py-3 backdrop-blur">
        <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-[16px] bg-tg-blue font-tg-display text-lg font-semibold text-white">
          {teacher ? initialsOf(teacher.name) : '💬'}
        </span>
        <div className="flex min-w-0 flex-1 flex-col">
          <span className="text-[13px] font-extrabold uppercase text-tg-muted">Oʻqituvchi bilan muloqot</span>
          <span className="truncate font-tg-display text-xl font-semibold leading-tight">{teacher?.name ?? 'Oʻqituvchi'}</span>
        </div>
        {teacher?.phone && (
          <a
            href={telHref(teacher.phone)}
            aria-label="Qoʻngʻiroq qilish"
            className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-tg-leaf text-white active:scale-95"
          >
            <Phone className="h-5 w-5" strokeWidth={2.5} />
          </a>
        )}
      </header>

      <Messages messages={messages} onSuggestion={setText} />

      <div className="fixed inset-x-0 bottom-0 z-20 border-t-2 border-tg-line bg-white pb-[max(12px,env(safe-area-inset-bottom))] pt-2.5">
        {send.isError && (
          <p className="mx-auto mb-2 max-w-lg px-[18px] text-sm font-bold text-tg-cherry">Xabar yuborilmadi. Qayta urinib koʻring.</p>
        )}
        <div className="mx-auto flex max-w-lg items-end gap-2 px-3">
          <AutoGrowInput value={text} onChange={setText} onSubmit={submit} />
          <button
            type="button"
            onClick={submit}
            disabled={!text.trim() || send.isPending}
            aria-label="Yuborish"
            className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-tg-blue text-white active:scale-95 disabled:opacity-40"
          >
            {send.isPending ? <Loader2 className="h-5 w-5 animate-spin" /> : <SendHorizontal className="h-5 w-5" strokeWidth={2.5} />}
          </button>
        </div>
      </div>
    </div>
  )
}

function AutoGrowInput({ value, onChange, onSubmit }: { value: string; onChange: (v: string) => void; onSubmit: () => void }) {
  const ref = useRef<HTMLTextAreaElement>(null)
  useLayoutEffect(() => {
    const el = ref.current
    if (!el) return
    el.style.height = 'auto'
    el.style.height = `${Math.min(el.scrollHeight, 140)}px`
  }, [value])
  return (
    <textarea
      ref={ref}
      rows={1}
      value={value}
      maxLength={MAX_LENGTH}
      onChange={(e) => onChange(e.target.value)}
      // On a phone Enter makes a new line (the send button sends); on desktop Telegram, Enter sends.
      onKeyDown={(e) => {
        if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing && window.matchMedia('(pointer: fine)').matches) {
          e.preventDefault()
          onSubmit()
        }
      }}
      placeholder="Xabar yozing…"
      className="min-h-12 flex-1 resize-none rounded-[20px] border-2 border-tg-line bg-tg-cream px-4 py-2.5 text-base font-semibold text-tg-ink placeholder:text-tg-faint focus:border-tg-blue focus:outline-none"
    />
  )
}

function Messages({ messages, onSuggestion }: { messages: MiniChatMessage[]; onSuggestion: (text: string) => void }) {
  const last = messages.at(-1)?.id
  useLayoutEffect(() => {
    window.scrollTo({ top: document.body.scrollHeight })
  }, [last])

  if (messages.length === 0) {
    return (
      <div className="flex flex-1 flex-col items-center justify-center gap-3 px-8 py-10 text-center">
        <p className="flex h-20 w-20 items-center justify-center rounded-[26px] bg-tg-sun text-4xl" aria-hidden>
          💬
        </p>
        <h2 className="font-tg-display text-[22px] font-semibold leading-tight">Savolingiz bormi?</h2>
        <p className="text-[15px] font-bold leading-relaxed text-tg-muted">
          Oʻqituvchiga shu yerda yozing — masalan, farzandingiz darsga kela olmasa. Javob shu yerga va botga keladi.
        </p>
        <div className="mt-1 flex flex-wrap justify-center gap-2">
          {SUGGESTIONS.map((s) => (
            <button
              key={s}
              type="button"
              onClick={() => onSuggestion(s)}
              className="rounded-full border-2 border-tg-line bg-white px-3.5 py-2 text-sm font-extrabold text-tg-blue-dark active:scale-95"
            >
              {s}
            </button>
          ))}
        </div>
      </div>
    )
  }

  return (
    <div className="flex flex-1 flex-col gap-1.5 px-3.5 pb-6 pt-4">
      {messages.map((m, i) => {
        const prev = messages[i - 1]
        const date = new Date(m.createdAt)
        const newDay = !prev || new Date(prev.createdAt).toDateString() !== date.toDateString()
        const sameAuthor = !newDay && prev.fromFamily === m.fromFamily && prev.senderName === m.senderName
        return (
          <div key={m.id} className="flex flex-col">
            {newDay && (
              <span className="my-2 self-center rounded-full bg-tg-sand px-3 py-1 text-xs font-extrabold text-tg-muted">
                {dayLabel(date)}
              </span>
            )}
            <Bubble message={m} showName={!sameAuthor} />
          </div>
        )
      })}
    </div>
  )
}

function dayLabel(date: Date): string {
  const today = new Date()
  const yesterday = new Date(today.getFullYear(), today.getMonth(), today.getDate() - 1)
  if (date.toDateString() === today.toDateString()) return 'Bugun'
  if (date.toDateString() === yesterday.toDateString()) return 'Kecha'
  return `${date.getDate()}-${MONTHS[date.getMonth()]}`
}

function Bubble({ message, showName }: { message: MiniChatMessage; showName: boolean }) {
  // Own messages on the right in blue; the student's other linked accounts (e.g. the other parent) on the right too, lighter and named.
  const right = message.fromFamily
  const tone = message.mine
    ? 'rounded-br-md bg-tg-blue text-white'
    : message.fromFamily
      ? 'rounded-br-md bg-tg-blue-soft text-tg-ink'
      : 'rounded-bl-md border-2 border-tg-line bg-white text-tg-ink'
  const nameTone = message.mine ? 'text-white/80' : message.fromFamily ? 'text-tg-blue-dark' : 'text-tg-grape'
  return (
    <div className={`flex ${right ? 'justify-end' : 'justify-start'} ${showName ? 'mt-1.5' : ''}`}>
      <div className={`max-w-[82%] rounded-[20px] px-3.5 py-2 ${tone}`}>
        {showName && !message.mine && <p className={`mb-0.5 text-[13px] font-extrabold ${nameTone}`}>{message.senderName}</p>}
        <p className="whitespace-pre-wrap break-words text-[16px] font-semibold leading-snug">{message.text}</p>
        <p className={`mt-0.5 text-right text-[11px] font-bold ${message.mine ? 'text-white/70' : 'text-tg-faint'}`}>{formatTime(message.createdAt)}</p>
      </div>
    </div>
  )
}
