import { createContext, useContext, useState, type ReactNode } from 'react'
import { useQuery, useQueryClient } from '@tanstack/react-query'
import { auth, ApiError } from './api'
import type { Actor } from './types'

type AuthContextValue = {
  actor: Actor | null | undefined
  isLoading: boolean
  login: (username: string, password: string) => Promise<void>
  logout: () => Promise<void>
}

const AuthContext = createContext<AuthContextValue | null>(null)

export function AuthProvider({ children }: { children: ReactNode }) {
  const queryClient = useQueryClient()
  const [loggingIn, setLoggingIn] = useState(false)

  const { data: actor, isLoading } = useQuery({
    queryKey: ['me'],
    queryFn: async () => {
      try {
        return await auth.me()
      } catch (err) {
        if (err instanceof ApiError && err.statusCode === 401) return null
        throw err
      }
    },
    retry: false,
    staleTime: Infinity,
  })

  async function login(username: string, password: string) {
    setLoggingIn(true)
    try {
      await auth.login(username, password)
      await queryClient.invalidateQueries({ queryKey: ['me'] })
    } finally {
      setLoggingIn(false)
    }
  }

  async function logout() {
    await auth.logout()
    queryClient.setQueryData(['me'], null)
    queryClient.clear()
  }

  return (
    <AuthContext.Provider value={{ actor, isLoading: isLoading || loggingIn, login, logout }}>
      {children}
    </AuthContext.Provider>
  )
}

export function useAuth() {
  const ctx = useContext(AuthContext)
  if (!ctx) throw new Error('useAuth must be used within AuthProvider')
  return ctx
}
