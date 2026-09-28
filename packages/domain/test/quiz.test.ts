import { describe, expect, it } from 'vitest'
import { isQuizOpen, quizPoints, validateQuizInput, type QuizInput } from '../src/quiz/quiz'

const question = (options = [true, false]) => ({
  text: 'She ___ to school every day.',
  options: options.map((isCorrect, i) => ({ text: `Option ${i}`, isCorrect })),
})

const valid: QuizInput = { title: 'Daily quiz', maxPoints: 10, questions: [question()] }

describe('quizPoints', () => {
  it('is proportional to the share answered correctly', () => {
    expect(quizPoints(10, 8, 10)).toBe(8)
    expect(quizPoints(20, 8, 10)).toBe(16)
    expect(quizPoints(10, 10, 10)).toBe(10)
  })

  it('rounds to a whole point', () => {
    expect(quizPoints(10, 1, 3)).toBe(3)
    expect(quizPoints(10, 2, 3)).toBe(7)
  })

  it('gives nothing for a quiz with no questions or no correct answers', () => {
    expect(quizPoints(10, 0, 0)).toBe(0)
    expect(quizPoints(10, 0, 5)).toBe(0)
  })
})

describe('isQuizOpen', () => {
  const now = new Date('2026-09-28T10:00:00Z')

  it('is open only when sent and before the deadline', () => {
    expect(isQuizOpen({ status: 'SENT', deadline: new Date('2026-09-28T18:00:00Z') }, now)).toBe(true)
    expect(isQuizOpen({ status: 'SENT', deadline: now }, now)).toBe(false)
    expect(isQuizOpen({ status: 'DRAFT', deadline: null }, now)).toBe(false)
  })
})

describe('validateQuizInput', () => {
  it('accepts a well-formed quiz', () => {
    expect(() => validateQuizInput(valid)).not.toThrow()
  })

  it('requires exactly one correct option per question', () => {
    expect(() => validateQuizInput({ ...valid, questions: [question([true, true])] })).toThrow(/exactly one/)
    expect(() => validateQuizInput({ ...valid, questions: [question([false, false])] })).toThrow(/exactly one/)
  })

  it('requires 2-6 options, at least one question, and whole non-negative points', () => {
    expect(() => validateQuizInput({ ...valid, questions: [question([true])] })).toThrow(/2-6/)
    expect(() => validateQuizInput({ ...valid, questions: [question([true, false, false, false, false, false, false])] })).toThrow(/2-6/)
    expect(() => validateQuizInput({ ...valid, questions: [] })).toThrow(/at least one/)
    expect(() => validateQuizInput({ ...valid, maxPoints: -1 })).toThrow(/Max points/)
    expect(() => validateQuizInput({ ...valid, maxPoints: 2.5 })).toThrow(/Max points/)
  })
})
