import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { KeyRound, Link2, Plus } from 'lucide-react'
import { ApiError, parents as parentsApi, students as studentsApi } from '../lib/api'
import {
  Button,
  Card,
  EmptyState,
  ErrorBanner,
  Field,
  Input,
  Modal,
  PageHeader,
  Select,
  Spinner,
} from '../components/ui'

export function ParentsPage() {
  const [showCreate, setShowCreate] = useState(false)
  const [linkingParentId, setLinkingParentId] = useState<string | null>(null)
  const [codeByParent, setCodeByParent] = useState<Record<string, string>>({})
  const [error, setError] = useState<string | null>(null)
  const queryClient = useQueryClient()

  const parentsQuery = useQuery({ queryKey: ['parents'], queryFn: parentsApi.list })

  const linkingCodeMutation = useMutation({
    mutationFn: (parentId: string) => parentsApi.issueLinkingCode(parentId),
    onSuccess: (result, parentId) => setCodeByParent((prev) => ({ ...prev, [parentId]: result.code })),
    onError: (err) => setError(err instanceof ApiError ? err.message : 'Kod berib boʻlmadi'),
  })

  return (
    <div>
      <PageHeader
        title="Ota-onalar"
        description="Oʻquvchilarga bogʻlangan ota-onalar"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Yangi ota-ona
          </Button>
        }
      />

      {error && (
        <div className="mb-4">
          <ErrorBanner message={error} />
        </div>
      )}

      <Card>
        {parentsQuery.isLoading ? (
          <Spinner />
        ) : parentsQuery.data?.length === 0 ? (
          <EmptyState title="Hali ota-onalar yoʻq" />
        ) : (
          <ul className="divide-y divide-slate-100">
            {parentsQuery.data?.map((parent) => (
              <li key={parent.id} className="flex items-center justify-between px-5 py-3">
                <div>
                  <p className="text-sm font-medium text-slate-900">{parent.fullName}</p>
                  {parent.phone && <p className="text-xs text-slate-500">{parent.phone}</p>}
                  {codeByParent[parent.id] && (
                    <p className="mt-1 font-mono text-sm font-semibold tracking-widest text-brand-700">
                      {codeByParent[parent.id]}
                    </p>
                  )}
                </div>
                <div className="flex gap-2">
                  <Button variant="secondary" onClick={() => setLinkingParentId(parent.id)}>
                    <Link2 className="h-4 w-4" /> Farzand bogʻlash
                  </Button>
                  <Button
                    variant="secondary"
                    onClick={() => linkingCodeMutation.mutate(parent.id)}
                    loading={linkingCodeMutation.isPending}
                  >
                    <KeyRound className="h-4 w-4" />
                  </Button>
                </div>
              </li>
            ))}
          </ul>
        )}
      </Card>

      {showCreate && (
        <CreateParentModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['parents'] })
            setShowCreate(false)
          }}
        />
      )}

      {linkingParentId && (
        <LinkChildModal
          parentId={linkingParentId}
          onClose={() => setLinkingParentId(null)}
          onLinked={() => setLinkingParentId(null)}
        />
      )}
    </div>
  )
}

function CreateParentModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState('')
  const [phone, setPhone] = useState('')
  const [error, setError] = useState<string | null>(null)

  const createMutation = useMutation({
    mutationFn: () => parentsApi.create({ fullName, phone: phone || undefined }),
    onSuccess: onCreated,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Ota-ona yaratib boʻlmadi"),
  })

  return (
    <Modal title="Yangi ota-ona" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          createMutation.mutate()
        }}
        className="space-y-4"
      >
        {error && <ErrorBanner message={error} />}
        <Field label="Toʻliq ism">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Telefon (ixtiyoriy)">
          <Input value={phone} onChange={(e) => setPhone(e.target.value)} />
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Ota-ona yaratish
          </Button>
        </div>
      </form>
    </Modal>
  )
}

function LinkChildModal({
  parentId,
  onClose,
  onLinked,
}: {
  parentId: string
  onClose: () => void
  onLinked: () => void
}) {
  const [studentId, setStudentId] = useState('')
  const [error, setError] = useState<string | null>(null)
  const studentsQuery = useQuery({ queryKey: ['students', 'ACTIVE'], queryFn: () => studentsApi.list('ACTIVE') })

  const linkMutation = useMutation({
    mutationFn: () => parentsApi.link(parentId, studentId),
    onSuccess: onLinked,
    onError: (err) => setError(err instanceof ApiError ? err.message : "Oʻquvchini bogʻlab boʻlmadi"),
  })

  return (
    <Modal title="Farzandni bogʻlash" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          setError(null)
          if (studentId) linkMutation.mutate()
        }}
        className="space-y-4"
      >
        {error && <ErrorBanner message={error} />}
        <Field label="Oʻquvchi">
          <Select value={studentId} onChange={(e) => setStudentId(e.target.value)} required>
            <option value="">Oʻquvchini tanlang</option>
            {studentsQuery.data?.map((s) => (
              <option key={s.id} value={s.id}>
                {s.firstName} {s.lastName}
              </option>
            ))}
          </Select>
        </Field>
        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={linkMutation.isPending}>
            Bogʻlash
          </Button>
        </div>
      </form>
    </Modal>
  )
}
