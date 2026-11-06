import { describe, expect, it } from 'vitest'
import { buildAccounting, monthLines, type AccountingData } from '../src/payment/accounting'

const d = (iso: string) => new Date(`${iso}T00:00:00.000Z`)
const day = (year: number, month: number, dd: number) => ({ year, month, day: dd })

const FEE = 500_000
const OCT = { year: 2026, month: 10 }
const NOV = { year: 2026, month: 11 }
// 6 November: Ali (joined 1 Sep) is due on the 1st, Vali (joined 15 Sep) on the 15th.
const TODAY = day(2026, 11, 6)

function center(): AccountingData {
  return {
    groups: [
      { id: 'g1', name: 'IELTS 1', monthlyFee: FEE, teacherName: 'Aziza Karimova' },
      { id: 'g2', name: 'Kids', monthlyFee: 300_000, teacherName: 'Rustam Nazarov' },
    ],
    students: [
      { id: 'ali', firstName: 'Ali', lastName: 'A', joinedAt: d('2026-09-01'), status: 'ACTIVE' },
      { id: 'vali', firstName: 'Vali', lastName: 'V', joinedAt: d('2026-09-15'), status: 'ACTIVE' },
      { id: 'sami', firstName: 'Sami', lastName: 'S', joinedAt: d('2026-10-10'), status: 'ACTIVE' },
    ],
    enrollments: [
      { studentId: 'ali', groupId: 'g1', startDate: d('2026-09-01'), endDate: null },
      { studentId: 'vali', groupId: 'g1', startDate: d('2026-09-15'), endDate: null },
      { studentId: 'sami', groupId: 'g2', startDate: d('2026-10-10'), endDate: null },
    ],
    payments: [
      // Ali paid October on 3 October; Vali paid 200k of it on 20 October.
      { id: 'p1', studentId: 'ali', year: 2026, month: 10, amountDue: FEE, amountPaid: FEE, note: null, paidAt: d('2026-10-03'), createdAt: d('2026-10-03') },
      { id: 'p2', studentId: 'vali', year: 2026, month: 10, amountDue: FEE, amountPaid: 200_000, note: null, paidAt: null, createdAt: d('2026-10-20') },
    ],
  }
}

describe('accounting', () => {
  it('expects every billed student, counts what was paid, and shows the gap', () => {
    const a = buildAccounting(center(), OCT, TODAY)
    // Ali paid, Vali half-paid, Sami nothing (his fee is the Kids group's).
    expect(a.summary).toMatchObject({ expected: 1_300_000, collected: 700_000, missing: 600_000, overdue: 600_000 })
    expect(a.summary).toMatchObject({ students: 3, paid: 1, partial: 1, unpaid: 1, overdueStudents: 2 })
  })

  it('splits the gap into unpaid, the rest of partial payments, and not yet due', () => {
    const data = center()
    data.payments.push({ id: 'p3', studentId: 'vali', year: 2026, month: 11, amountDue: FEE, amountPaid: 100_000, note: null, paidAt: null, createdAt: d('2026-11-02') })
    const { summary } = buildAccounting(data, NOV, TODAY)
    // Ali owes all of November (his day passed); Vali 400k is left; Sami's day (10th) is ahead.
    expect(summary).toMatchObject({ unpaidAmount: FEE, partialAmount: 400_000, upcomingAmount: 300_000 })
    expect(summary.unpaidAmount + summary.partialAmount + summary.upcomingAmount).toBe(summary.missing)
    // Vali's day (15th) hasn't come, so only Ali's is overdue.
    expect([summary.overdue, summary.overdueStudents]).toEqual([FEE, 1])
  })

  it('keeps a not-yet-due payment apart from an overdue one', () => {
    const state = Object.fromEntries(monthLines(center(), NOV, TODAY).map((l) => [l.studentId, l.state]))
    expect(state).toEqual({ ali: 'unpaid', vali: 'upcoming', sami: 'upcoming' })
  })

  it('lists groups biggest shortfall first, with their teacher', () => {
    const a = buildAccounting(center(), OCT, TODAY)
    expect(a.groups.map((g) => [g.groupName, g.teacherName, g.expected, g.collected, g.missing])).toEqual([
      ['IELTS 1', 'Aziza Karimova', 1_000_000, 700_000, 300_000],
      ['Kids', 'Rustam Nazarov', 300_000, 0, 300_000],
    ])
  })

  it('compares with last month by this same day, and by its end', () => {
    const a = buildAccounting(center(), NOV, TODAY)
    // October expected 1.3M. By 6 October only Ali's 500k was in (38%); all told 700k (54%).
    expect(a.previous).toEqual({ year: 2026, month: 10, sameDayPercent: 38, finalPercent: 54 })
  })

  it('shows only the end-of-month share when looking back at a past month', () => {
    const a = buildAccounting(center(), OCT, TODAY)
    expect(a.previous.sameDayPercent).toBeNull()
  })

  it('bills nobody for a month before they joined', () => {
    expect(monthLines(center(), { year: 2026, month: 9 }, TODAY).map((l) => l.studentId)).toEqual(['ali', 'vali'])
  })

  it('stops billing a student once they left the group', () => {
    const data = center()
    data.enrollments[1].endDate = d('2026-10-20')
    data.students[1].status = 'LEFT'
    expect(monthLines(data, NOV, TODAY).some((l) => l.studentId === 'vali')).toBe(false)
    // October's cycle (from the 15th) was theirs to pay.
    expect(monthLines(data, OCT, TODAY).some((l) => l.studentId === 'vali')).toBe(true)
  })

  it('bills the group a student moved to mid-cycle', () => {
    const data = center()
    data.enrollments[0].endDate = d('2026-11-03')
    data.enrollments.push({ studentId: 'ali', groupId: 'g2', startDate: d('2026-11-03'), endDate: null })
    const ali = monthLines(data, NOV, TODAY).find((l) => l.studentId === 'ali')!
    expect([ali.groupName, ali.amountDue]).toEqual(['Kids', 300_000])
  })

  it("limits a teacher to their own groups' bills", () => {
    const a = buildAccounting(center(), OCT, TODAY, new Set(['g2']))
    expect(a.lines.map((l) => l.studentId)).toEqual(['sami'])
    expect(a.summary.expected).toBe(300_000)
  })

  it('flags a group with no fee instead of expecting 0', () => {
    const data = center()
    data.groups[1].monthlyFee = 0
    const sami = monthLines(data, OCT, TODAY).find((l) => l.studentId === 'sami')!
    expect(sami.state).toBe('noFee')
  })
})
