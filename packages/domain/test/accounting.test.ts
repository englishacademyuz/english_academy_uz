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
      { id: 'g1', name: 'IELTS 1', monthlyFee: FEE },
      { id: 'g2', name: 'Kids', monthlyFee: 300_000 },
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
      { id: 'p1', studentId: 'ali', year: 2026, month: 10, amountDue: FEE, amountPaid: FEE, note: null },
      { id: 'p2', studentId: 'vali', year: 2026, month: 10, amountDue: FEE, amountPaid: 200_000, note: null },
    ],
  }
}

describe('accounting', () => {
  it('expects every billed student, counts what was paid, and shows the gap', () => {
    const a = buildAccounting(center(), OCT, TODAY)
    // Ali paid, Vali half-paid, Sami nothing (his fee is the Kids group's).
    expect(a.summary).toMatchObject({ expected: 1_300_000, collected: 700_000, missing: 600_000, overdue: 600_000 })
    expect(a.summary).toMatchObject({ students: 3, paid: 1, partial: 1, unpaid: 1 })
    expect(a.groups.map((g) => [g.groupName, g.expected, g.collected])).toEqual([
      ['IELTS 1', 1_000_000, 700_000],
      ['Kids', 300_000, 0],
    ])
  })

  it('keeps a not-yet-due payment apart from the overdue debt', () => {
    const lines = monthLines(center(), NOV, TODAY)
    const state = Object.fromEntries(lines.map((l) => [l.studentId, l.state]))
    // Ali's day (1st) has passed; Vali's (15th) and Sami's (10th) haven't.
    expect(state).toEqual({ ali: 'unpaid', vali: 'upcoming', sami: 'upcoming' })
    const a = buildAccounting(center(), NOV, TODAY)
    expect(a.summary.missing).toBe(1_300_000)
    expect(a.summary.overdue).toBe(FEE)
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

  it("forecasts next month from today's roster", () => {
    const a = buildAccounting(center(), OCT, TODAY)
    expect(a.forecast).toMatchObject({ year: 2026, month: 12, expected: 1_300_000, students: 3 })
  })

  it('adds up the debt over every month that came due, per student', () => {
    const a = buildAccounting(center(), OCT, TODAY)
    // Ali: Sep + Nov unpaid; Vali: Sep + Oct's remaining 300k; Sami: Oct.
    expect(a.debtors.map((x) => [x.studentId, x.months, x.amount])).toEqual([
      ['ali', 2, 1_000_000],
      ['vali', 2, 800_000],
      ['sami', 1, 300_000],
    ])
    expect(a.totalDebt).toBe(2_100_000)
  })

  it('shows the six months up to the chosen one', () => {
    const a = buildAccounting(center(), OCT, TODAY)
    expect(a.trend.map((t) => t.month)).toEqual([5, 6, 7, 8, 9, 10])
    expect(a.trend.at(-1)).toMatchObject({ expected: 1_300_000, collected: 700_000 })
  })
})
