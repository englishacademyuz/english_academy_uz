import { useMemo, useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { Link2, Search, Smartphone, Unlink } from 'lucide-react'
import { ApiError, students as studentsApi } from '../../lib/api'
import { initials } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { StudentListItem } from '../../lib/types'
import { Button, Input, Modal } from '../ui'

const fullName = (s: { firstName: string; lastName: string }) => `${s.firstName} ${s.lastName}`

/**
 * "One phone": ties siblings together, so the code of any one of them opens all of them in the
 * bot -- the app asks whose account to open, and each child's notifications reach the family's
 * phones with their name on them.
 */
export function FamilyModal({ student, all, onClose }: { student: StudentListItem; all: StudentListItem[]; onClose: () => void }) {
  const [search, setSearch] = useState('')
  const queryClient = useQueryClient()
  const refresh = () => queryClient.invalidateQueries({ queryKey: ['students'] })

  // The list is refetched after each change, so the family is read straight from it.
  const current = all.find((s) => s.id === student.id) ?? student
  const members = current.familyId ? all.filter((s) => s.familyId === current.familyId) : [current]

  const matches = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    if (!needle) return []
    return all
      .filter((s) => !members.some((m) => m.id === s.id))
      .filter((s) => fullName(s).toLocaleLowerCase().includes(needle) || `${s.lastName} ${s.firstName}`.toLocaleLowerCase().includes(needle))
      .slice(0, 6)
  }, [all, members, search])

  const tie = useMutation({
    mutationFn: (otherId: string) => studentsApi.tie(current.id, otherId),
    onSuccess: () => {
      notifySuccess('Bitta qurilmaga bogʻlandi')
      setSearch('')
      refresh()
    },
    onError: (err) =>
      err instanceof ApiError && err.message === 'FAMILY_TOO_BIG'
        ? notifyError(null, 'Bitta qurilmaga koʻpi bilan 5 ta oʻquvchi bogʻlanadi')
        : notifyError(err, 'Bogʻlab boʻlmadi'),
  })

  const untie = useMutation({
    mutationFn: (id: string) => studentsApi.untie(id),
    onSuccess: () => {
      notifySuccess('Ajratildi')
      refresh()
    },
    onError: (err) => notifyError(err, 'Ajratib boʻlmadi'),
  })

  return (
    <Modal title="Bitta qurilma" onClose={onClose} size="lg">
      <p className="mb-4 text-sm text-slate-500 dark:text-slate-400">
        Bir oiladagi aka-uka, opa-singillar bitta telefondan foydalansa, ularni bogʻlang. Birining kodi bilan ulangan Telegram
        hamma bogʻlangan oʻquvchilarni ochadi: ilova avval kimning hisobiga kirishni soʻraydi, xabarnomalar esa oʻquvchi ismi bilan
        keladi.
      </p>

      <ul className="space-y-2">
        {members.map((m) => (
          <li
            key={m.id}
            className="flex items-center gap-3 rounded-lg border border-slate-200 px-3 py-2.5 dark:border-slate-700"
          >
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-brand-50 text-xs font-bold text-brand-700 dark:bg-brand-500/10 dark:text-brand-300">
              {initials(fullName(m))}
            </span>
            <span className="min-w-0 flex-1 truncate text-sm font-medium text-slate-900 dark:text-slate-100">{fullName(m)}</span>
            {members.length > 1 && (
              <Button
                variant="ghost"
                size="sm"
                loading={untie.isPending && untie.variables === m.id}
                onClick={() => untie.mutate(m.id)}
              >
                <Unlink className="h-3.5 w-3.5" /> Ajratish
              </Button>
            )}
          </li>
        ))}
      </ul>
      {members.length > 1 && (
        <p className="mt-2 flex items-center gap-1.5 text-xs text-slate-400 dark:text-slate-500">
          <Smartphone className="h-3.5 w-3.5" /> {members.length} ta oʻquvchi bitta qurilmada
        </p>
      )}

      <div className="mt-5">
        <p className="mb-2 text-sm font-medium text-slate-700 dark:text-slate-300">Oʻquvchi qoʻshish</p>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Aka-uka yoki opa-singilning ismi…"
            className="pl-9"
            autoFocus
          />
        </div>
        {matches.length > 0 && (
          <ul className="mt-2 space-y-1.5">
            {matches.map((s) => (
              <li key={s.id} className="flex items-center gap-3 rounded-lg px-3 py-2 hover:bg-slate-50 dark:hover:bg-slate-800/60">
                <span className="min-w-0 flex-1">
                  <span className="block truncate text-sm font-medium text-slate-900 dark:text-slate-100">{fullName(s)}</span>
                  <span className="block truncate text-xs text-slate-400 dark:text-slate-500">
                    {s.groups.map((g) => g.name).join(', ') || 'Guruhsiz'}
                    {s.familyId && ' · bogʻlanganlari bilan birga qoʻshiladi'}
                  </span>
                </span>
                <Button size="sm" loading={tie.isPending && tie.variables === s.id} onClick={() => tie.mutate(s.id)}>
                  <Link2 className="h-3.5 w-3.5" /> Bogʻlash
                </Button>
              </li>
            ))}
          </ul>
        )}
        {search.trim() && matches.length === 0 && (
          <p className="mt-2 text-xs text-slate-400 dark:text-slate-500">Oʻquvchi topilmadi</p>
        )}
      </div>
    </Modal>
  )
}
