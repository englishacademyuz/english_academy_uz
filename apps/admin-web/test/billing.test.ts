import { describe, expect, it } from 'vitest'
import { billingMonthOf, paymentDueDate } from '../src/lib/format'

// A group whose lessons started on 15 September pays on the 15th of every month.
const START = new Date(2026, 8, 15)

describe('billingMonthOf', () => {
  it("is the month whose payment day has most recently passed", () => {
    expect(billingMonthOf(START, new Date(2026, 9, 20))).toEqual({ year: 2026, month: 10 })
    expect(billingMonthOf(START, new Date(2026, 9, 15))).toEqual({ year: 2026, month: 10 })
    // 3 October is still inside September's cycle (15 Sep – 14 Oct).
    expect(billingMonthOf(START, new Date(2026, 9, 3))).toEqual({ year: 2026, month: 9 })
  })

  it('rolls over the year', () => {
    expect(billingMonthOf(START, new Date(2027, 0, 5))).toEqual({ year: 2026, month: 12 })
  })

  it("is the group's first month before its lessons start", () => {
    expect(billingMonthOf(START, new Date(2026, 8, 1))).toEqual({ year: 2026, month: 9 })
  })
})

describe('paymentDueDate', () => {
  it("falls on the group's start day, clamped in shorter months", () => {
    expect(paymentDueDate(START, 2026, 10)).toEqual(new Date(2026, 9, 15))
    expect(paymentDueDate(new Date(2026, 0, 31), 2026, 2)).toEqual(new Date(2026, 1, 28))
  })
})
