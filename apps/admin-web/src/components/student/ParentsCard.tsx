import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Link2, Unlink } from 'lucide-react'
import { parents as parentsApi } from '../../lib/api'
import { notifyError, notifySuccess } from '../../lib/toast'
import type { Parent, ParentStudentLink } from '../../lib/types'
import { Button, Card, EmptyState, Field, Modal, Select, Spinner } from '../ui'

export function ParentsCard({
  studentId,
  links,
}: {
  studentId: string
  links: Array<ParentStudentLink & { parent: Parent }>
}) {
  const [showLink, setShowLink] = useState(false)
  const queryClient = useQueryClient()

  const revokeMutation = useMutation({
    mutationFn: (linkId: string) => parentsApi.revokeLink(linkId),
    onSuccess: () => {
      notifySuccess('Bogʻlanish bekor qilindi')
      queryClient.invalidateQueries({ queryKey: ['student-overview', studentId] })
    },
    onError: (err) => notifyError(err, "Bogʻlanishni bekor qilib boʻlmadi"),
  })

  return (
    <Card className="p-5">
      <div className="mb-3 flex items-center justify-between">
        <h2 className="text-sm font-semibold text-slate-900 dark:text-slate-100">Ota-onalar</h2>
        <Button variant="secondary" onClick={() => setShowLink(true)}>
          <Link2 className="h-4 w-4" /> Bogʻlash
        </Button>
      </div>

      {links.length === 0 ? (
        <EmptyState title="Hali ota-ona bogʻlanmagan" />
      ) : (
        <ul className="divide-y divide-slate-100 dark:divide-slate-800">
          {links.map((link) => (
            <li key={link.id} className="flex items-center justify-between py-3">
              <div>
                <p className="text-sm font-medium text-slate-900 dark:text-slate-100">{link.parent.fullName}</p>
                {link.parent.phone && (
                  <p className="text-xs text-slate-500 dark:text-slate-400">{link.parent.phone}</p>
                )}
              </div>
              <Button
                variant="ghost"
                onClick={() => revokeMutation.mutate(link.id)}
                loading={revokeMutation.isPending}
              >
                <Unlink className="h-4 w-4" /> Bogʻlanishni yechish
              </Button>
            </li>
          ))}
        </ul>
      )}

      {showLink && (
        <LinkParentModal
          studentId={studentId}
          existingParentIds={links.map((l) => l.parentId)}
          onClose={() => setShowLink(false)}
          onLinked={() => {
            queryClient.invalidateQueries({ queryKey: ['student-overview', studentId] })
            setShowLink(false)
          }}
        />
      )}
    </Card>
  )
}

function LinkParentModal({
  studentId,
  existingParentIds,
  onClose,
  onLinked,
}: {
  studentId: string
  existingParentIds: string[]
  onClose: () => void
  onLinked: () => void
}) {
  const [parentId, setParentId] = useState('')
  const parentsQuery = useQuery({ queryKey: ['parents'], queryFn: parentsApi.list })
  const available = (parentsQuery.data ?? []).filter((p) => !existingParentIds.includes(p.id))

  const linkMutation = useMutation({
    mutationFn: () => parentsApi.link(parentId, studentId),
    onSuccess: () => {
      notifySuccess('Ota-ona bogʻlandi')
      onLinked()
    },
    onError: (err) => notifyError(err, "Ota-onani bogʻlab boʻlmadi"),
  })

  return (
    <Modal title="Ota-onani bogʻlash" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          if (parentId) linkMutation.mutate()
        }}
        className="space-y-4"
      >
        {parentsQuery.isLoading ? (
          <Spinner />
        ) : available.length === 0 ? (
          <p className="text-sm text-slate-400 dark:text-slate-500">
            Bogʻlash mumkin boʻlgan ota-ona topilmadi. Avval "Ota-onalar" boʻlimida yangi ota-ona yarating.
          </p>
        ) : (
          <Field label="Ota-ona">
            <Select value={parentId} onChange={(e) => setParentId(e.target.value)} required>
              <option value="">Ota-onani tanlang</option>
              {available.map((p) => (
                <option key={p.id} value={p.id}>
                  {p.fullName}
                </option>
              ))}
            </Select>
          </Field>
        )}
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={linkMutation.isPending} disabled={!parentId}>
            Bogʻlash
          </Button>
        </div>
      </form>
    </Modal>
  )
}
