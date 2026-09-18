import { useState } from 'react'
import { ClipboardCheck, GraduationCap, Trophy, Wallet } from 'lucide-react'
import type { Group } from '../../lib/types'
import { Tabs } from '../ui'
import { MarksMatrixView } from './MarksMatrixView'
import { JournalView } from './JournalView'
import { LeaderboardView } from './LeaderboardView'
import { PaymentsMatrixView } from './PaymentsMatrixView'

type StudentViewMode = 'journal' | 'marks' | 'points' | 'payments'

const MODES: Array<{ key: StudentViewMode; label: string; icon: typeof ClipboardCheck }> = [
  { key: 'journal', label: 'Jurnal', icon: ClipboardCheck },
  { key: 'marks', label: 'Baholar', icon: GraduationCap },
  { key: 'points', label: 'Ballar', icon: Trophy },
  { key: 'payments', label: "Toʻlovlar", icon: Wallet },
]

/** The group's student-centric workspace: one roster, viewed through whichever lens (attendance, marks, points, accounting) the teacher needs right now. Jurnal also owns enrolling students -- there's no separate roster mode. */
export function StudentsTab({ group }: { group: Group }) {
  const [mode, setMode] = useState<StudentViewMode>('journal')

  return (
    <div className="space-y-4">
      <Tabs tabs={MODES} active={mode} onChange={setMode} />

      {mode === 'journal' && <JournalView group={group} />}
      {mode === 'marks' && <MarksMatrixView group={group} />}
      {mode === 'points' && <LeaderboardView group={group} />}
      {mode === 'payments' && <PaymentsMatrixView group={group} />}
    </div>
  )
}
