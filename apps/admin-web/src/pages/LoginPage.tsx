import { useState, type FormEvent } from 'react'
import { Navigate } from 'react-router-dom'
import { GraduationCap } from 'lucide-react'
import { useAuth } from '../lib/auth'
import { notifyError } from '../lib/toast'
import { Button, Field, Input } from '../components/ui'

export function LoginPage() {
  const { actor, login, isLoading } = useAuth()
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')
  const [submitting, setSubmitting] = useState(false)

  if (actor) return <Navigate to="/" replace />

  async function handleSubmit(e: FormEvent) {
    e.preventDefault()
    setSubmitting(true)
    try {
      await login(username, password)
    } catch (err) {
      notifyError(err, 'Xatolik yuz berdi. Iltimos, qayta urinib koʻring.')
    } finally {
      setSubmitting(false)
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 dark:bg-slate-950 px-4">
      <div className="w-full max-w-sm">
        <div className="mb-8 flex flex-col items-center text-center">
          <div className="mb-3 flex h-12 w-12 items-center justify-center rounded-xl bg-brand-600 text-white">
            <GraduationCap className="h-6 w-6" />
          </div>
          <h1 className="text-xl font-semibold text-slate-900 dark:text-slate-100">Tashkurgan Academy</h1>
          <p className="mt-1 text-sm text-slate-500 dark:text-slate-400">Boshqaruv paneliga kiring</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4 rounded-xl border border-slate-200 dark:border-slate-700 bg-white dark:bg-slate-900 p-6 shadow-sm">
          <Field label="Foydalanuvchi nomi">
            <Input
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoFocus
              autoComplete="username"
              required
            />
          </Field>

          <Field label="Parol">
            <Input
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete="current-password"
              required
            />
          </Field>

          <Button type="submit" className="w-full" loading={submitting || isLoading}>
            Kirish
          </Button>
        </form>
      </div>
    </div>
  )
}
