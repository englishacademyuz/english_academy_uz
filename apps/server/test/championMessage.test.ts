import { describe, expect, it } from 'vitest'
import { formatChampionAnnouncement } from '../src/bot/format'

const october = {
  groupName: 'IELTS 1',
  month: 10,
  winners: [{ firstName: 'Asliddin', lastName: 'Kholturaev', points: 120 }],
}

describe('champion announcement', () => {
  it('congratulates the champion by name in their own chat', () => {
    const text = formatChampionAnnouncement({ ...october, studentNames: ['Asliddin Kholturaev'] })
    expect(text).toContain('Tabriklaymiz!')
    expect(text).toContain('<b>Asliddin Kholturaev</b> oktabr oyining chempioni')
    expect(text).toContain('120 ball bilan guruhda 1-oʻrin')
    expect(text).toContain('Noyabrda ballar yana 0 dan')
  })

  it('tells classmates the news with the champion shortened to a last initial', () => {
    const text = formatChampionAnnouncement({ ...october, studentNames: ['Vali Saidov'] })
    expect(text).toContain('Oktabr oyi chempioni!')
    expect(text).toContain('<b>Asliddin K.</b> — 120 ball')
    expect(text).not.toContain('Kholturaev')
  })

  it('names the co-champions when the title is shared', () => {
    const text = formatChampionAnnouncement({
      ...october,
      winners: [...october.winners, { firstName: 'Vali', lastName: 'Saidov', points: 120 }],
      studentNames: ['Vali Saidov'],
    })
    expect(text).toContain('<b>Vali Saidov</b> oktabr oyining chempioni')
    expect(text).toContain('Asliddin K. bilan birga')
  })

  it('rolls December over to January', () => {
    const text = formatChampionAnnouncement({ ...october, month: 12, studentNames: ['Vali Saidov'] })
    expect(text).toContain('Dekabr oyi chempioni!')
    expect(text).toContain('Yanvarda ballar')
  })
})
