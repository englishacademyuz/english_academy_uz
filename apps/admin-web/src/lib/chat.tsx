import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react'

type ChatContextValue = {
  isOpen: boolean
  /** The thread shown in the chat window, or null for just the list. */
  studentId: string | null
  /** Opens the chat window -- on one student's thread when given. */
  open: (studentId?: string) => void
  select: (studentId: string | null) => void
  close: () => void
}

const ChatContext = createContext<ChatContextValue | null>(null)

/** The family chat window is one per panel, openable from anywhere (the chat button, a toast, a student's page). */
export function ChatProvider({ children }: { children: ReactNode }) {
  const [isOpen, setIsOpen] = useState(false)
  const [studentId, setStudentId] = useState<string | null>(null)

  const open = useCallback((id?: string) => {
    if (id) setStudentId(id)
    setIsOpen(true)
  }, [])
  const close = useCallback(() => setIsOpen(false), [])

  const value = useMemo(
    () => ({ isOpen, studentId, open, select: setStudentId, close }),
    [isOpen, studentId, open, close],
  )
  return <ChatContext.Provider value={value}>{children}</ChatContext.Provider>
}

export function useChat() {
  const ctx = useContext(ChatContext)
  if (!ctx) throw new Error('useChat must be used within ChatProvider')
  return ctx
}
