import { useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link } from 'react-router-dom'
import { ArrowDown, ArrowUp, Cake, Plus, Search, Trophy, UserX, X } from 'lucide-react'
import { students as studentsApi } from '../lib/api'
import { ageFrom, initials, studentStatusLabel, studentStatusTone } from '../lib/format'
import { levelStyles } from '../lib/levelColor'
import { notifyError, notifySuccess } from '../lib/toast'
import type { StudentListItem, StudentStatus } from '../lib/types'
import { Badge, Button, Card, EmptyState, Field, Input, Modal, PageHeader, Select, Spinner } from '../components/ui'

const STATUSES: StudentStatus[] = ['ACTIVE', 'PAUSED', 'INACTIVE', 'COMPLETED', 'LEFT']

const STATUS_DOT: Record<StudentStatus, string> = {
  ACTIVE: 'bg-emerald-500',
  PAUSED: 'bg-amber-500',
  INACTIVE: 'bg-slate-400',
  COMPLETED: 'bg-sky-500',
  LEFT: 'bg-red-500',
}

/** '' = every group; NONE = students in no group right now. */
const NO_GROUP = '__none__'

type SortKey = 'name' | 'points' | 'absences' | 'attendance'
type Sort = { key: SortKey; dir: 'asc' | 'desc' }

const SORT_OPTIONS: Array<{ value: string; label: string; sort: Sort }> = [
  { value: 'name-asc', label: 'Ism (A–Z)', sort: { key: 'name', dir: 'asc' } },
  { value: 'points-desc', label: 'Reyting: yuqoridan', sort: { key: 'points', dir: 'desc' } },
  { value: 'points-asc', label: 'Reyting: pastdan', sort: { key: 'points', dir: 'asc' } },
  { value: 'attendance-desc', label: 'Davomat: eng yaxshi', sort: { key: 'attendance', dir: 'desc' } },
  { value: 'attendance-asc', label: 'Davomat: eng past', sort: { key: 'attendance', dir: 'asc' } },
  { value: 'absences-desc', label: 'Eng koʻp qoldirgan', sort: { key: 'absences', dir: 'desc' } },
]

const fullName = (s: StudentListItem) => `${s.firstName} ${s.lastName}`

function sortValue(s: StudentListItem, key: SortKey): number | string {
  switch (key) {
    case 'name':
      return fullName(s).toLocaleLowerCase()
    case 'points':
      return s.points
    case 'absences':
      return s.attendance.totals.ABSENT
    case 'attendance':
      // Students with no attendance yet always sink to the bottom, whichever way it's sorted.
      return s.attendance.rate ?? Number.NaN
  }
}

function compare(a: StudentListItem, b: StudentListItem, sort: Sort): number {
  const va = sortValue(a, sort.key)
  const vb = sortValue(b, sort.key)
  if (typeof va === 'number' && typeof vb === 'number') {
    if (Number.isNaN(va) || Number.isNaN(vb)) return Number.isNaN(va) ? (Number.isNaN(vb) ? 0 : 1) : -1
  }
  const result = va < vb ? -1 : va > vb ? 1 : 0
  return (sort.dir === 'asc' ? result : -result) || fullName(a).localeCompare(fullName(b))
}

function rateColor(rate: number) {
  if (rate >= 85) return 'bg-emerald-500'
  if (rate >= 65) return 'bg-amber-500'
  return 'bg-red-500'
}

export function StudentsPage() {
  const [statusFilter, setStatusFilter] = useState<StudentStatus | ''>('ACTIVE')
  const [groupFilter, setGroupFilter] = useState('')
  const [search, setSearch] = useState('')
  const [sort, setSort] = useState<Sort>({ key: 'name', dir: 'asc' })
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()

  // One fetch of everyone -- status counts, group options and filtering are all client-side.
  const studentsQuery = useQuery({ queryKey: ['students', 'all'], queryFn: () => studentsApi.list() })
  const all = useMemo(() => studentsQuery.data ?? [], [studentsQuery.data])

  const statusCounts = useMemo(() => {
    const counts = new Map<string, number>()
    for (const s of all) counts.set(s.status, (counts.get(s.status) ?? 0) + 1)
    return counts
  }, [all])

  const groupOptions = useMemo(() => {
    const seen = new Map<string, StudentListItem['groups'][number]>()
    for (const s of all) for (const g of s.groups) seen.set(g.id, g)
    return [...seen.values()].sort((a, b) => a.name.localeCompare(b.name))
  }, [all])

  const visible = useMemo(() => {
    const needle = search.trim().toLocaleLowerCase()
    return all
      .filter((s) => !statusFilter || s.status === statusFilter)
      .filter((s) =>
        !groupFilter ? true : groupFilter === NO_GROUP ? s.groups.length === 0 : s.groups.some((g) => g.id === groupFilter),
      )
      .filter((s) => !needle || fullName(s).toLocaleLowerCase().includes(needle) || `${s.lastName} ${s.firstName}`.toLocaleLowerCase().includes(needle))
      .sort((a, b) => compare(a, b, sort))
  }, [all, statusFilter, groupFilter, search, sort])

  const unassignedCount = all.filter((s) => (!statusFilter || s.status === statusFilter) && s.groups.length === 0).length
  const filtersActive = !!groupFilter || !!search

  function toggleSort(key: SortKey) {
    setSort((prev) =>
      prev.key === key ? { key, dir: prev.dir === 'asc' ? 'desc' : 'asc' } : { key, dir: key === 'name' ? 'asc' : 'desc' },
    )
  }

  return (
    <div>
      <PageHeader
        title="Oʻquvchilar"
        description="Hozir yoki avval oʻqigan barcha oʻquvchilar"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Yangi oʻquvchi
          </Button>
        }
      />

      <div className="mb-4 flex flex-wrap gap-1 rounded-xl bg-slate-100 p-1 ring-1 ring-inset ring-slate-200 dark:bg-slate-800/60 dark:ring-slate-700 sm:inline-flex">
        {(['', ...STATUSES] as const).map((status) => {
          const active = statusFilter === status
          const count = status ? statusCounts.get(status) ?? 0 : all.length
          return (
            <button
              key={status || 'ALL'}
              onClick={() => setStatusFilter(status)}
              className={`inline-flex items-center gap-2 rounded-lg px-3 py-1.5 text-sm font-medium transition-all ${
                active
                  ? 'bg-white text-slate-900 shadow-sm dark:bg-slate-900 dark:text-white'
                  : 'text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100'
              }`}
            >
              {status && <span className={`h-2 w-2 rounded-full ${STATUS_DOT[status]}`} />}
              {status ? studentStatusLabel[status] : 'Barchasi'}
              <span
                className={`rounded-full px-1.5 text-[11px] font-semibold tabular-nums ${
                  active ? 'bg-brand-600 text-white' : 'bg-slate-200 text-slate-500 dark:bg-slate-700 dark:text-slate-300'
                }`}
              >
                {count}
              </span>
            </button>
          )
        })}
      </div>

      <Card>
        <div className="flex flex-wrap items-center gap-3 border-b border-slate-100 p-4 dark:border-slate-800">
          <div className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <Input
              value={search}
              onChange={(e) => setSearch(e.target.value)}
              placeholder="Ism yoki familiya boʻyicha qidirish…"
              className="pl-9"
            />
          </div>
          <div className="w-full sm:w-52">
            <Select value={groupFilter} onChange={(e) => setGroupFilter(e.target.value)}>
              <option value="">Barcha guruhlar</option>
              <option value={NO_GROUP}>Guruhsiz ({unassignedCount})</option>
              {groupOptions.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name} · {g.level.name}
                </option>
              ))}
            </Select>
          </div>
          <div className="w-full sm:w-52">
            <Select
              value={`${sort.key}-${sort.dir}`}
              onChange={(e) => setSort(SORT_OPTIONS.find((o) => o.value === e.target.value)?.sort ?? sort)}
            >
              {SORT_OPTIONS.map((o) => (
                <option key={o.value} value={o.value}>
                  {o.label}
                </option>
              ))}
              {!SORT_OPTIONS.some((o) => o.value === `${sort.key}-${sort.dir}`) && (
                <option value={`${sort.key}-${sort.dir}`}>Ism (Z–A)</option>
              )}
            </Select>
          </div>
          {filtersActive && (
            <button
              onClick={() => {
                setGroupFilter('')
                setSearch('')
              }}
              className="inline-flex items-center gap-1 text-xs font-medium text-slate-500 hover:text-slate-800 dark:text-slate-400 dark:hover:text-slate-100"
            >
              <X className="h-3.5 w-3.5" /> Tozalash
            </button>
          )}
        </div>

        {studentsQuery.isLoading ? (
          <Spinner />
        ) : visible.length === 0 ? (
          <EmptyState title="Ushbu filtrga mos oʻquvchi topilmadi" />
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="text-left text-[11px] font-semibold uppercase tracking-wide text-slate-400 dark:text-slate-500">
                  <SortHeader label="Oʻquvchi" sortKey="name" sort={sort} onSort={toggleSort} className="pl-5" />
                  <th className="px-3 py-3">Guruh</th>
                  <SortHeader label="Reyting" sortKey="points" sort={sort} onSort={toggleSort} align="right" />
                  <SortHeader label="Davomat" sortKey="attendance" sort={sort} onSort={toggleSort} />
                  <SortHeader label="Qoldirgan" sortKey="absences" sort={sort} onSort={toggleSort} align="right" />
                  <th className="px-3 py-3 pr-5 text-right">Holat</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 dark:divide-slate-800">
                {visible.map((student) => (
                  <StudentRow key={student.id} student={student} />
                ))}
              </tbody>
            </table>
            <p className="border-t border-slate-100 px-5 py-2.5 text-xs text-slate-400 dark:border-slate-800 dark:text-slate-500">
              {visible.length} ta oʻquvchi koʻrsatilmoqda
            </p>
          </div>
        )}
      </Card>

      {showCreate && (
        <CreateStudentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['students'] })
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}

function SortHeader({
  label,
  sortKey,
  sort,
  onSort,
  align = 'left',
  className = '',
}: {
  label: string
  sortKey: SortKey
  sort: Sort
  onSort: (key: SortKey) => void
  align?: 'left' | 'right'
  className?: string
}) {
  const active = sort.key === sortKey
  const Arrow = sort.dir === 'asc' ? ArrowUp : ArrowDown
  return (
    <th className={`px-3 py-3 ${align === 'right' ? 'text-right' : ''} ${className}`}>
      <button
        onClick={() => onSort(sortKey)}
        className={`inline-flex items-center gap-1 uppercase tracking-wide transition-colors hover:text-slate-700 dark:hover:text-slate-200 ${
          active ? 'text-brand-600 dark:text-brand-400' : ''
        }`}
      >
        {label}
        {active && <Arrow className="h-3 w-3" />}
      </button>
    </th>
  )
}

function StudentRow({ student }: { student: StudentListItem }) {
  const age = ageFrom(student.dob)
  const primary = student.groups[0]
  const accent = levelStyles(primary?.level.color)
  const { rate, totals } = student.attendance

  return (
    <tr className="group transition-colors hover:bg-slate-50 dark:hover:bg-slate-800/40">
      <td className="py-2.5 pl-5 pr-3">
        <Link to={`/students/${student.id}`} className="flex items-center gap-3">
          <span
            className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full text-xs font-bold"
            style={primary ? accent.soft : undefined}
          >
            <span className={primary ? '' : 'text-slate-500'}>{initials(`${student.firstName} ${student.lastName}`)}</span>
          </span>
          <span className="min-w-0">
            <span className="block truncate font-medium text-slate-900 group-hover:text-brand-600 dark:text-slate-100 dark:group-hover:text-brand-400">
              {student.firstName} {student.lastName}
            </span>
            <span className="flex items-center gap-2 text-xs text-slate-400 dark:text-slate-500">
              {age !== null && (
                <span className="inline-flex items-center gap-1">
                  <Cake className="h-3 w-3" /> {age} yosh
                </span>
              )}
              {student.phone && <span>{student.phone}</span>}
            </span>
          </span>
        </Link>
      </td>
      <td className="px-3 py-2.5">
        {student.groups.length === 0 ? (
          <span className="inline-flex items-center gap-1 rounded-full border border-dashed border-slate-300 px-2 py-0.5 text-xs text-slate-400 dark:border-slate-600">
            <UserX className="h-3 w-3" /> Guruhsiz
          </span>
        ) : (
          <span className="flex flex-wrap gap-1">
            {student.groups.map((g) => {
              const styles = levelStyles(g.level.color)
              return (
                <Link
                  key={g.id}
                  to={`/groups/${g.id}`}
                  className="inline-flex items-center gap-1.5 rounded-full px-2 py-0.5 text-xs font-semibold"
                  style={styles.soft}
                  title={g.level.name}
                >
                  <span className="h-1.5 w-1.5 rounded-full" style={styles.fill} />
                  {g.name}
                </Link>
              )
            })}
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <span className="inline-flex items-center gap-1 font-semibold tabular-nums text-slate-900 dark:text-slate-100">
          <Trophy className={`h-3.5 w-3.5 ${student.points > 0 ? 'text-amber-500' : 'text-slate-300 dark:text-slate-600'}`} />
          {student.points}
        </span>
      </td>
      <td className="px-3 py-2.5">
        {rate === null ? (
          <span className="text-xs text-slate-300 dark:text-slate-600">—</span>
        ) : (
          <span className="flex items-center gap-2">
            <span className="h-1.5 w-16 overflow-hidden rounded-full bg-slate-100 dark:bg-slate-800">
              <span className={`block h-full rounded-full ${rateColor(rate)}`} style={{ width: `${rate}%` }} />
            </span>
            <span className="text-xs font-semibold tabular-nums text-slate-600 dark:text-slate-300">{Math.round(rate)}%</span>
          </span>
        )}
      </td>
      <td className="px-3 py-2.5 text-right">
        <span
          className={`text-sm font-semibold tabular-nums ${
            totals.ABSENT > 0 ? 'text-red-600 dark:text-red-400' : 'text-slate-300 dark:text-slate-600'
          }`}
        >
          {totals.ABSENT}
        </span>
      </td>
      <td className="px-3 py-2.5 pr-5 text-right">
        <Badge tone={studentStatusTone[student.status]}>{studentStatusLabel[student.status]}</Badge>
      </td>
    </tr>
  )
}

function CreateStudentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [firstName, setFirstName] = useState('')
  const [lastName, setLastName] = useState('')
  const [dob, setDob] = useState('')
  const [phone, setPhone] = useState('')
  const age = dob ? ageFrom(`${dob}T00:00:00`) : null

  const createMutation = useMutation({
    mutationFn: () => studentsApi.create({ firstName, lastName, dob, phone: phone || undefined }),
    onSuccess: () => {
      notifySuccess('Oʻquvchi yaratildi')
      onCreated()
    },
    onError: (err) => notifyError(err, 'Oʻquvchi yaratib boʻlmadi'),
  })

  return (
    <Modal title="Yangi oʻquvchi" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          createMutation.mutate()
        }}
        className="space-y-4"
      >
        <div className="grid grid-cols-2 gap-4">
          <Field label="Ism">
            <Input value={firstName} onChange={(e) => setFirstName(e.target.value)} required />
          </Field>
          <Field label="Familiya">
            <Input value={lastName} onChange={(e) => setLastName(e.target.value)} required />
          </Field>
        </div>

        <div className="grid grid-cols-[1fr_auto] items-end gap-3">
          <Field label="Tugʻilgan sana">
            <Input
              type="date"
              value={dob}
              max={new Date().toISOString().slice(0, 10)}
              onChange={(e) => setDob(e.target.value)}
              required
            />
          </Field>
          <div
            className={`flex h-[38px] min-w-[88px] items-center justify-center gap-1.5 rounded-lg px-3 text-sm font-semibold ${
              age !== null
                ? 'bg-brand-50 text-brand-700 dark:bg-brand-500/10 dark:text-brand-300'
                : 'bg-slate-100 text-slate-400 dark:bg-slate-800'
            }`}
            aria-live="polite"
          >
            <Cake className="h-4 w-4" />
            {age !== null ? `${age} yosh` : 'Yosh'}
          </div>
        </div>

        <Field label="Telefon (ixtiyoriy)">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} placeholder="+998 90 123 45 67" />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Oʻquvchi yaratish
          </Button>
        </div>
      </form>
    </Modal>
  )
}
