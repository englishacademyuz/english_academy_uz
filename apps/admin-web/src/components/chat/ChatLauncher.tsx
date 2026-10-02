import { useEffect, useRef } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { MessageCircle } from 'lucide-react'
import { toast } from 'react-toastify'
import { conversations } from '../../lib/api'
import { useChat } from '../../lib/chat'
import { initials } from '../../lib/format'
import { ChatModal } from './ChatModal'

/** How often the panel checks for new family messages. */
const POLL_MS = 15_000

/**
 * The round chat button in the corner of every page: a red badge with the unread count, a toast
 * when a new family message arrives, and the chat window itself.
 */
export function ChatLauncher() {
  const chat = useChat()
  const queryClient = useQueryClient()
  const unread = useQuery({
    queryKey: ['conversations', 'unread'],
    queryFn: conversations.unread,
    refetchInterval: POLL_MS,
    refetchIntervalInBackground: true,
  })

  // The newest message already announced -- the first poll only sets it, so opening the panel
  // doesn't toast about messages that were waiting from before.
  const seenRef = useRef<string | null | undefined>(undefined)
  const latest = unread.data?.latest ?? null
  useEffect(() => {
    if (!unread.data) return
    const at = latest?.createdAt ?? null
    const previous = seenRef.current
    seenRef.current = at
    if (previous === undefined || !latest || !at || (previous && at <= previous)) return
    // Something new: refresh the open list/thread, and toast unless that thread is already on screen.
    queryClient.invalidateQueries({ queryKey: ['conversations', 'list'] })
    if (chat.isOpen && chat.studentId === latest.studentId) {
      queryClient.invalidateQueries({ queryKey: ['conversations', 'thread', latest.studentId] })
      return
    }
    toast(<NewMessageToast studentName={latest.studentName} senderName={latest.senderName} text={latest.text} />, {
      icon: false,
      autoClose: 6000,
      onClick: () => chat.open(latest.studentId),
      toastId: `chat-${latest.studentId}-${at}`,
    })
  }, [unread.data, latest, chat, queryClient])

  const count = unread.data?.messages ?? 0
  useEffect(() => {
    const base = document.title.replace(/^\(\d+\+?\) /, '')
    document.title = count > 0 ? `(${count > 99 ? '99+' : count}) ${base}` : base
  }, [count])

  return (
    <>
      <button
        type="button"
        onClick={() => chat.open()}
        aria-label={count > 0 ? `Xabarlar, ${count} ta oʻqilmagan` : 'Xabarlar'}
        title="Ota-onalar bilan muloqot"
        className="fixed bottom-4 right-4 z-40 flex h-14 w-14 sm:bottom-6 sm:right-6 items-center justify-center rounded-full bg-brand-600 text-white shadow-lg shadow-brand-600/30 transition hover:scale-105 hover:bg-brand-700 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-brand-600"
      >
        <MessageCircle className="h-6 w-6" />
        {count > 0 && (
          <>
            <span className="absolute -right-0.5 -top-0.5 h-6 min-w-6 animate-ping rounded-full bg-red-500/60" aria-hidden />
            <span className="absolute -right-1 -top-1 flex h-6 min-w-6 items-center justify-center rounded-full bg-red-500 px-1.5 text-xs font-bold tabular-nums text-white ring-2 ring-white dark:ring-slate-950">
              {count > 99 ? '99+' : count}
            </span>
          </>
        )}
      </button>
      {chat.isOpen && <ChatModal />}
    </>
  )
}

function NewMessageToast({ studentName, senderName, text }: { studentName: string; senderName: string; text: string }) {
  return (
    <div className="flex cursor-pointer items-start gap-3">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-brand-600 text-sm font-semibold text-white">
        {initials(studentName)}
      </span>
      <div className="min-w-0">
        <p className="text-sm font-semibold text-slate-900 dark:text-slate-100">{studentName} · ota-onasi</p>
        <p className="text-xs text-slate-500 dark:text-slate-400">{senderName}</p>
        <p className="mt-1 line-clamp-2 text-sm text-slate-700 dark:text-slate-300">{text}</p>
      </div>
    </div>
  )
}
