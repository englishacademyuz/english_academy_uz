import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Check, Users } from 'lucide-react'
import { enrollments as enrollmentsApi, groups as groupsApi } from '../../lib/api'
import { formatScheduleDays, todayInputValue } from '../../lib/format'
import { levelStyles } from '../../lib/levelColor'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Student } from '../../lib/types'
import { Button, Field, Input, Modal, Spinner } from '../ui'

/** Shown right after a student is created, so they can be put into a group in the same flow. */
export function AssignGroupModal({ student, onClose }: { student: Student; onClose: () => void }) {
  const [groupId, setGroupId] = useState('')
  // The day they joined the center is almost always the day they join their first group.
  const [startDate, setStartDate] = useState(() => student.joinedAt?.slice(0, 10) ?? todayInputValue())
  const queryClient = useQueryClient()

  const groupsQuery = useQuery({ queryKey: ['groups'], queryFn: groupsApi.list })
  const groups = groupsQuery.data ?? []

  const enrollMutation = useMutation({
    mutationFn: () => enrollmentsApi.enroll(groupId, student.id, startDate),
    onSuccess: () => {
      notifySuccess('Oʻquvchi guruhga qoʻshildi')
      queryClient.invalidateQueries({ queryKey: ['students'] })
      queryClient.invalidateQueries({ queryKey: ['student-overview', student.id] })
      queryClient.invalidateQueries({ queryKey: ['groups'] })
      queryClient.invalidateQueries({ queryKey: ['group', groupId] })
      onClose()
    },
    onError: (err) => notifyError(err, 'Oʻquvchini guruhga qoʻshib boʻlmadi'),
  })

  return (
    <Modal title={`${student.firstName} ${student.lastName} — guruhga qoʻshish`} onClose={onClose} size="lg">
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (groupId) enrollMutation.mutate()
        }}
        className="space-y-4"
      >
        {groupsQuery.isLoading ? (
          <Spinner />
        ) : groups.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">Hozircha faol guruh yoʻq.</p>
        ) : (
          <div className="space-y-2">
            <p className="text-sm font-medium text-slate-700 dark:text-slate-300">Guruhni tanlang</p>
            <ul className="max-h-80 space-y-2 overflow-y-auto pr-1">
              {groups.map((g) => {
                const styles = levelStyles(g.level?.color)
                const selected = g.id === groupId
                return (
                  <li key={g.id}>
                    <button
                      type="button"
                      onClick={() => setGroupId(g.id)}
                      className={`flex w-full items-center gap-3 rounded-lg border px-3 py-2.5 text-left transition-colors ${
                        selected
                          ? 'border-brand-500 bg-brand-50 dark:border-brand-400 dark:bg-brand-500/10'
                          : 'border-slate-200 hover:bg-slate-50 dark:border-slate-700 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <span className="h-8 w-1 shrink-0 rounded-full" style={styles.fill} />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate text-sm font-semibold text-slate-900 dark:text-slate-100">
                          {g.name}
                          {g.level && (
                            <span className="ml-2 rounded-full px-1.5 py-0.5 text-[11px] font-semibold" style={styles.soft}>
                              {g.level.name}
                            </span>
                          )}
                        </span>
                        <span className="block truncate text-xs text-slate-500 dark:text-slate-400">
                          {formatScheduleDays(g.scheduleDays)} · {g.scheduleTime}
                          {g.teacher?.fullName ? ` · ${g.teacher.fullName}` : ''}
                        </span>
                      </span>
                      <span className="inline-flex items-center gap-1 text-xs tabular-nums text-slate-400">
                        <Users className="h-3.5 w-3.5" /> {g.enrollments?.length ?? 0}
                      </span>
                      <span
                        className={`flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${
                          selected ? 'bg-brand-600 text-white' : 'ring-1 ring-inset ring-slate-300 dark:ring-slate-600'
                        }`}
                      >
                        {selected && <Check className="h-3 w-3" />}
                      </span>
                    </button>
                  </li>
                )
              })}
            </ul>
          </div>
        )}

        <Field label="Boshlanish sanasi">
          <Input type="date" value={startDate} onChange={(e) => setStartDate(e.target.value)} required />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Keyinroq
          </Button>
          <Button type="submit" loading={enrollMutation.isPending} disabled={!groupId}>
            Guruhga qoʻshish
          </Button>
        </div>
      </form>
    </Modal>
  )
}
