import { describe, expect, it } from 'vitest'
import { billingMonthOf, paymentDay, paymentReminder, reminderStage, tashkentToday } from '../src/billing'

// A student who joined on 15 September pays on the 15th of every month.
const JOINED = '2026-09-15T00:00:00.000Z'
const day = (year: number, month: number, d: number) => ({ year, month, day: d })

describe('billingMonthOf', () => {
  it('is the month whose payment day has most recently passed', () => {
    expect(billingMonthOf(JOINED, day(2026, 10, 20))).toEqual({ year: 2026, month: 10 })
    expect(billingMonthOf(JOINED, day(2026, 10, 15))).toEqual({ year: 2026, month: 10 })
    // 3 October is still inside September's cycle (15 Sep – 14 Oct).
    expect(billingMonthOf(JOINED, day(2026, 10, 3))).toEqual({ year: 2026, month: 9 })
  })

  it('rolls over the year', () => {
    expect(billingMonthOf(JOINED, day(2027, 1, 5))).toEqual({ year: 2026, month: 12 })
  })

  it("is the student's first month before they join", () => {
    expect(billingMonthOf(JOINED, day(2026, 9, 1))).toEqual({ year: 2026, month: 9 })
  })
})

describe('paymentDay', () => {
  it('falls on the join day, clamped in shorter months', () => {
    expect(paymentDay(JOINED, { year: 2026, month: 10 })).toEqual(day(2026, 10, 15))
    expect(paymentDay('2026-01-31T00:00:00.000Z', { year: 2026, month: 2 })).toEqual(day(2026, 2, 28))
  })
})

describe('tashkentToday', () => {
  it('is already tomorrow in Tashkent late in the UTC evening', () => {
    expect(tashkentToday(new Date('2026-09-30T20:00:00Z'))).toEqual(day(2026, 10, 1))
    expect(tashkentToday(new Date('2026-09-30T18:59:00Z'))).toEqual(day(2026, 9, 30))
  })
})

describe('reminderStage', () => {
  it('warns ahead, is due on the day, late for five days, then a debtor', () => {
    expect(reminderStage(3)).toBe('upcoming')
    expect(reminderStage(0)).toBe('due')
    expect(reminderStage(-1)).toBe('overdue')
    expect(reminderStage(-5)).toBe('overdue')
    expect(reminderStage(-6)).toBe('debtor')
  })
})

describe('paymentReminder', () => {
  const sep = { year: 2026, month: 9 }

  it('owes the first month from the day the student joins', () => {
    expect(paymentReminder(JOINED, [], day(2026, 9, 15))).toMatchObject({ stage: 'due', month: 9, daysLeft: 0, unpaidCycles: 1 })
  })

  it('is nothing more than three days ahead', () => {
    expect(paymentReminder(JOINED, [], day(2026, 9, 11))).toBeNull()
    expect(paymentReminder(JOINED, [sep], day(2026, 10, 11))).toBeNull()
  })

  it('warns three days before the next payment day', () => {
    expect(paymentReminder(JOINED, [sep], day(2026, 10, 12))).toMatchObject({ stage: 'upcoming', month: 10, daysLeft: 3, unpaidCycles: 0 })
  })

  it('turns late, then a debtor, until the month is paid', () => {
    expect(paymentReminder(JOINED, [sep], day(2026, 10, 20))).toMatchObject({ stage: 'overdue', daysLeft: -5 })
    expect(paymentReminder(JOINED, [sep], day(2026, 10, 21))).toMatchObject({ stage: 'debtor', daysLeft: -6 })
    expect(paymentReminder(JOINED, [sep, { year: 2026, month: 10 }], day(2026, 10, 21))).toBeNull()
  })

  it('points at the oldest unpaid month and counts every one owed', () => {
    expect(paymentReminder(JOINED, [], day(2026, 11, 16))).toMatchObject({ stage: 'debtor', month: 9, unpaidCycles: 3 })
  })
})
