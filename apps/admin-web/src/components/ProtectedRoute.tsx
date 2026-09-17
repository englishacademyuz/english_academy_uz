import { Navigate, Outlet } from 'react-router-dom'
import { useAuth } from '../lib/auth'
import { Spinner } from './ui'

export function ProtectedRoute() {
  const { actor, isLoading } = useAuth()

  if (isLoading) return <Spinner label="Sessiya tekshirilmoqda…" />
  if (!actor) return <Navigate to="/login" replace />

  return <Outlet />
}

export function AdminOnlyRoute() {
  const { actor } = useAuth()
  if (actor?.role !== 'ADMIN') return <Navigate to="/" replace />
  return <Outlet />
}
