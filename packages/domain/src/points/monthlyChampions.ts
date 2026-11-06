import { prisma } from '@tashkurgan/db'
import { addMonths, tashkentMonth, tashkentMonthRange, type BillingMonth } from '@tashkurgan/shared'

/**
 * Everyone tied on the month's top score -- nobody when no one earned any points, so a quiet
 * month (or a brand-new group) has no champion rather than a 0-point one.
 */
export function pickChampions<T extends { points: number }>(totals: T[]): T[] {
  const top = Math.max(0, ...totals.map((t) => t.points))
  return top > 0 ? totals.filter((t) => t.points === top) : []
}

/** Per-student sums of the points tagged to a Group within one Tashkent calendar month. */
export async function groupMonthTotals(groupId: string, month: BillingMonth) {
  const { start, end } = tashkentMonthRange(month)
  const rows = await prisma.pointTransaction.groupBy({
    by: ['studentId'],
    where: { groupId, createdAt: { gte: start, lt: end } },
    _sum: { points: true },
  })
  return rows.map((r) => ({ studentId: r.studentId, points: r._sum.points ?? 0 }))
}

const isBefore = (a: BillingMonth, b: BillingMonth) => a.year * 12 + a.month < b.year * 12 + b.month

/**
 * Records a Group's champion(s) for a month that has already ended. Done once: if the month
 * already has a champion it's left as it is, so a later re-grade can't take a title away.
 * Everyone who earned points in the Group that month counts -- also a student who has since
 * moved on. Safe to call concurrently (the unique key drops a second writer's rows).
 */
export async function settleMonthlyChampions(groupId: string, month: BillingMonth, now: Date = new Date()) {
  if (!isBefore(month, tashkentMonth(now))) return
  const already = await prisma.monthlyChampion.count({ where: { groupId, year: month.year, month: month.month } })
  if (already > 0) return

  const champions = pickChampions(await groupMonthTotals(groupId, month))
  if (champions.length === 0) return
  await prisma.monthlyChampion.createMany({
    data: champions.map((c) => ({ groupId, studentId: c.studentId, year: month.year, month: month.month, points: c.points })),
    skipDuplicates: true,
  })
}

/**
 * Settles last month for every Group that earned points in it. Run on a timer so the titles are
 * written just after midnight on the 1st, even for a group nobody opens.
 */
export async function settleLastMonthChampions(now: Date = new Date()) {
  const last = addMonths(tashkentMonth(now), -1)
  const { start, end } = tashkentMonthRange(last)
  const groups = await prisma.pointTransaction.groupBy({ by: ['groupId'], where: { createdAt: { gte: start, lt: end } } })
  for (const { groupId } of groups) await settleMonthlyChampions(groupId, last, now)
}

export type ChampionAnnouncement = {
  groupId: string
  groupName: string
  year: number
  month: number
  winners: Array<{ firstName: string; lastName: string; points: number }>
}

/**
 * Last month's champions whose group hasn't been told in Telegram yet. Only last month: a title
 * from longer ago is old news by now, so it is never sent late.
 */
export async function pendingChampionAnnouncements(now: Date = new Date()): Promise<ChampionAnnouncement[]> {
  const last = addMonths(tashkentMonth(now), -1)
  const rows = await prisma.monthlyChampion.findMany({
    where: { year: last.year, month: last.month, announcedAt: null },
    include: { group: { select: { name: true } }, student: { select: { firstName: true, lastName: true } } },
    orderBy: { student: { firstName: 'asc' } },
  })
  const byGroup = new Map<string, ChampionAnnouncement>()
  for (const row of rows) {
    const entry = byGroup.get(row.groupId) ?? { groupId: row.groupId, groupName: row.group.name, year: row.year, month: row.month, winners: [] }
    entry.winners.push({ firstName: row.student.firstName, lastName: row.student.lastName, points: row.points })
    byGroup.set(row.groupId, entry)
  }
  return [...byGroup.values()]
}

/**
 * Marks a group's month as announced, and says whether this caller got it -- false when another
 * run already did, so the same news is never sent twice. Claimed before sending: a failed send
 * is lost rather than repeated.
 */
export async function claimChampionAnnouncement(a: { groupId: string; year: number; month: number }, now: Date = new Date()) {
  const { count } = await prisma.monthlyChampion.updateMany({
    where: { groupId: a.groupId, year: a.year, month: a.month, announcedAt: null },
    data: { announcedAt: now },
  })
  return count > 0
}

export type GroupChampionMonth = {
  year: number
  month: number
  winners: Array<{ student: { id: string; firstName: string; lastName: string }; points: number }>
}

/** A Group's past champions, newest month first -- settling last month first if that's still pending. */
export async function listGroupChampions(groupId: string, { limit = 12, now = new Date() } = {}): Promise<GroupChampionMonth[]> {
  await settleMonthlyChampions(groupId, addMonths(tashkentMonth(now), -1), now)

  const rows = await prisma.monthlyChampion.findMany({
    where: { groupId },
    include: { student: { select: { id: true, firstName: true, lastName: true } } },
    orderBy: [{ year: 'desc' }, { month: 'desc' }],
  })

  const months: GroupChampionMonth[] = []
  for (const row of rows) {
    let entry = months.at(-1)
    if (!entry || entry.year !== row.year || entry.month !== row.month) {
      if (months.length === limit) break
      entry = { year: row.year, month: row.month, winners: [] }
      months.push(entry)
    }
    entry.winners.push({ student: row.student, points: row.points })
  }
  for (const m of months) m.winners.sort((a, b) => a.student.firstName.localeCompare(b.student.firstName))
  return months
}
