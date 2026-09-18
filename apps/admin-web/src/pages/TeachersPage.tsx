import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Plus } from 'lucide-react'
import { teachers as teachersApi } from '../lib/api'
import { notifyError, notifySuccess } from '../lib/toast'
import { Button, Card, EmptyState, Field, Input, Modal, PageHeader, Spinner } from '../components/ui'

export function TeachersPage() {
  const [showCreate, setShowCreate] = useState(false)
  const queryClient = useQueryClient()
  const teachersQuery = useQuery({ queryKey: ['teachers'], queryFn: teachersApi.list })

  return (
    <div>
      <PageHeader
        title="Oʻqituvchilar"
        description="Tizimga kirib guruhlarni boshqaradigan xodimlar"
        actions={
          <Button onClick={() => setShowCreate(true)}>
            <Plus className="h-4 w-4" /> Yangi oʻqituvchi
          </Button>
        }
      />

      <Card>
        {teachersQuery.isLoading ? (
          <Spinner />
        ) : teachersQuery.data?.length === 0 ? (
          <EmptyState title="Hali oʻqituvchilar yoʻq" />
        ) : (
          <ul className="divide-y divide-slate-100 dark:divide-slate-800">
            {teachersQuery.data?.map((teacher) => (
              <li key={teacher.id} className="px-5 py-3 text-sm font-medium text-slate-900 dark:text-slate-100">
                {teacher.fullName}
              </li>
            ))}
          </ul>
        )}
      </Card>

      {showCreate && (
        <CreateTeacherModal
          onClose={() => setShowCreate(false)}
          onCreated={() => {
            queryClient.invalidateQueries({ queryKey: ['teachers'] })
            setShowCreate(false)
          }}
        />
      )}
    </div>
  )
}

function CreateTeacherModal({ onClose, onCreated }: { onClose: () => void; onCreated: () => void }) {
  const [fullName, setFullName] = useState('')
  const [username, setUsername] = useState('')
  const [password, setPassword] = useState('')

  const createMutation = useMutation({
    mutationFn: () => teachersApi.create({ fullName, username, password }),
    onSuccess: () => {
      notifySuccess("Oʻqituvchi yaratildi")
      onCreated()
    },
    onError: (err) => notifyError(err, "Oʻqituvchi yaratib boʻlmadi"),
  })

  return (
    <Modal title="Yangi oʻqituvchi" onClose={onClose}>
      <form
        onSubmit={(e) => {
          e.preventDefault()
          createMutation.mutate()
        }}
        className="space-y-4"
      >
        <Field label="Toʻliq ism">
          <Input value={fullName} onChange={(e) => setFullName(e.target.value)} required />
        </Field>
        <Field label="Foydalanuvchi nomi">
          <Input value={username} onChange={(e) => setUsername(e.target.value)} required minLength={3} />
        </Field>
        <Field label="Parol">
          <Input
            type="password"
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            required
            minLength={8}
          />
        </Field>

        <div className="flex justify-end gap-2 pt-2">
          <Button type="button" variant="secondary" onClick={onClose}>
            Bekor qilish
          </Button>
          <Button type="submit" loading={createMutation.isPending}>
            Oʻqituvchi yaratish
          </Button>
        </div>
      </form>
    </Modal>
  )
}
