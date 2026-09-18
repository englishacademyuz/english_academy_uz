import { describe, expect, it } from 'vitest'
import { computeOutstanding, derivePaymentStatus } from '../src/payment/payment'

describe('derivePaymentStatus', () => {
  it('is DEBT when nothing has been paid', () => {
    expect(derivePaymentStatus(500_000, 0)).toBe('DEBT')
  })

  it('is PARTIAL when something but not everything has been paid', () => {
    expect(derivePaymentStatus(500_000, 200_000)).toBe('PARTIAL')
  })

  it('is PAID once the paid amount reaches the due amount', () => {
    expect(derivePaymentStatus(500_000, 500_000)).toBe('PAID')
  })

  it('is PAID when overpaid', () => {
    expect(derivePaymentStatus(500_000, 600_000)).toBe('PAID')
  })
})

describe('computeOutstanding', () => {
  it('sums the unpaid remainder across months', () => {
    expect(
      computeOutstanding([
        { amountDue: 500_000, amountPaid: 200_000 },
        { amountDue: 500_000, amountPaid: 500_000 },
        { amountDue: 500_000, amountPaid: 0 },
      ]),
    ).toBe(800_000)
  })

  it('never lets an overpaid month offset another month\'s debt', () => {
    // Each month is tracked independently -- no automatic carry-forward
    // (§51.4) -- so an overpayment must not reduce another month's total.
    expect(
      computeOutstanding([
        { amountDue: 500_000, amountPaid: 700_000 },
        { amountDue: 500_000, amountPaid: 0 },
      ]),
    ).toBe(500_000)
  })

  it('returns 0 for an empty list', () => {
    expect(computeOutstanding([])).toBe(0)
  })
})
