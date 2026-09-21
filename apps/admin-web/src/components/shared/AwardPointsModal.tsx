import { useState } from 'react'
import { useMutation } from '@tanstack/react-query'
import { points as pointsApi } from '../../lib/api'
import { pointActivityTypeLabel } from '../../lib/format'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { PointActivityType } from '../../lib/types'
import { Button, Field, Input, Modal, Select } from '../ui'

const ACTIVITY_TYPES: PointActivityType[] = ['HOMEWORK', 'PARTICIPATION', 'QUIZ', 'ASSESSMENT', 'ATTENDANCE', 'OTHER']

/** Shared by the student profile's Points card and the group roster's Reyting view -- awarding is always tagged to one Group (§51.3). */
export function AwardPointsModal({
  studentId,
  studentName,
  groups,
  onClose,
  onAwarded,
}: {
  studentId: string
  studentName?: string
  groups: Array<{ id: string; name: string }>
  onClose: () => void
  onAwarded: () => void
}) {
  const [groupId, setGroupId] = useState(groups[0]?.id ?? '')
  const [activityType, setActivityType] = useState<PointActivityType>('PARTICIPATION')
  const [pointsValue, setPointsValue] = useState(10)
  const [note, setNote] = useState('')

  const awardMutation = useMutation({
    mutationFn: () => pointsApi.award(groupId, { studentId, activityType, points: pointsValue, note: note || undefined }),
    onSuccess: () => {
      notifySuccess('Ball berildi')
      onAwarded()
    },
    onError: (err) => notifyError(err, "Ball berib boʻlmadi"),
  })

  return (
    <Modal title={studentName ? `${studentName} — ball berish` : 'Ball berish'} onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          awardMutation.mutate()
        }}
        className="space-y-4"
      >
        {groups.length > 1 && (
          <Field label="Guruh">
            <Select value={groupId} onChange={(e) => setGroupId(e.target.value)} required>
              {groups.map((g) => (
                <option key={g.id} value={g.id}>
                  {g.name}
                </option>
              ))}
            </Select>
          </Field>
        )}

        <Field label="Faoliyat turi">
          <Select value={activityType} onChange={(e) => setActivityType(e.target.value as PointActivityType)}>
            {ACTIVITY_TYPES.map((t) => (
              <option key={t} value={t}>
                {pointActivityTypeLabel[t]}
              </option>
            ))}
          </Select>
        </Field>

        <Field label="Ball (tuzatish uchun manfiy son ham mumkin)">
          <Input type="number" value={pointsValue} onChange={(e) => setPointsValue(Number(e.target.value))} required />
        </Field>

        <Field label="Izoh (ixtiyoriy)">
          <Input value={note} onChange={(e) => setNote(e.target.value)} />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={awardMutation.isPending} disabled={!groupId}>
            Berish
          </Button>
        </div>
      </form>
    </Modal>
  )
}
