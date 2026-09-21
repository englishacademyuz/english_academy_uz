import { useState, type CSSProperties } from 'react'
import { ClipboardCheck, GraduationCap, Trophy, Wallet } from 'lucide-react'
import type { Group } from '../../lib/types'
import { Card, Tabs } from '../ui'
import { MarksMatrixView } from './MarksMatrixView'
import { JournalView } from './JournalView'
import { LeaderboardView } from './LeaderboardView'
import { PaymentsMatrixView } from './PaymentsMatrixView'
import { RosterColumn } from './RosterColumn'
import { AddStudentModal } from './AddStudentModal'

type StudentViewMode = 'journal' | 'marks' | 'points' | 'payments'

const MODES: Array<{ key: StudentViewMode; label: string; icon: typeof ClipboardCheck }> = [
  { key: 'journal', label: 'Davomat', icon: ClipboardCheck },
  { key: 'marks', label: 'Baholar', icon: GraduationCap },
  { key: 'points', label: 'Reyting', icon: Trophy },
  { key: 'payments', label: "Toʻlovlar", icon: Wallet },
]

// Shared by RosterColumn (left, rendered once) and the active detail view
// (right, swapped per tab) so their bands line up pixel-for-pixel -- a
// frozen-first-column table split across two components instead of one.
const BAND_VARS: CSSProperties = {
  ['--tabbar-h' as string]: '52px',
  ['--colhead-h' as string]: '60px',
  ['--row-h' as string]: '56px',
}

/** The group's student-centric workspace: one frozen roster on the left, viewed through whichever lens (attendance, marks, points, accounting) the teacher needs on the right. */
export function StudentsTab({ group }: { group: Group }) {
  const [mode, setMode] = useState<StudentViewMode>('journal')
  const [showAddStudent, setShowAddStudent] = useState(false)
  const roster = group.enrollments ?? []

  return (
    <Card className="overflow-hidden p-0">
      <div className="grid grid-cols-[370px_1fr]" style={BAND_VARS}>
        <RosterColumn roster={roster} onAddStudent={() => setShowAddStudent(true)} />

        <div className="flex min-w-0 flex-col">
          <div
            className="flex shrink-0 items-center overflow-x-auto border-b border-slate-100 px-5 dark:border-slate-800"
            style={{ height: 'var(--tabbar-h)' }}
          >
            {/* min-w-max keeps Tabs' own flex-wrap from kicking in -- this band scrolls
                horizontally instead of growing taller, so it never breaks row alignment. */}
            <div className="min-w-max">
              <Tabs tabs={MODES} active={mode} onChange={setMode} size="md" />
            </div>
          </div>

          {mode === 'journal' && <JournalView group={group} />}
          {mode === 'marks' && <MarksMatrixView group={group} />}
          {mode === 'points' && <LeaderboardView group={group} />}
          {mode === 'payments' && <PaymentsMatrixView group={group} />}
        </div>
      </div>

      {showAddStudent && <AddStudentModal group={group} onClose={() => setShowAddStudent(false)} />}
    </Card>
  )
}
