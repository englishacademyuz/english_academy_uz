import { describe, expect, it } from 'vitest'
import { buildQuizPrompt, parseQuizText } from '../src/lib/quizText'

const correctOf = (q: { options: Array<{ text: string; isCorrect: boolean }> }) =>
  q.options.filter((o) => o.isCorrect).map((o) => o.text)

describe('parseQuizText', () => {
  it('reads the exact format the prompt asks for', () => {
    const result = parseQuizText(`1. She ___ to school every day.
A) go
B) goes *
C) going
D) gone

2. They ___ football on Sundays.
A) plays
B) play *
C) playing
D) played`)

    expect(result.errors).toEqual([])
    expect(result.questions).toEqual([
      {
        text: 'She ___ to school every day.',
        options: [
          { text: 'go', isCorrect: false },
          { text: 'goes', isCorrect: true },
          { text: 'going', isCorrect: false },
          { text: 'gone', isCorrect: false },
        ],
      },
      {
        text: 'They ___ football on Sundays.',
        options: [
          { text: 'plays', isCorrect: false },
          { text: 'play', isCorrect: true },
          { text: 'playing', isCorrect: false },
          { text: 'played', isCorrect: false },
        ],
      },
    ])
  })

  it("ignores the AI's intro and outro", () => {
    const result = parseQuizText(`Sure! Here are 2 questions on Present Simple:

1. He ___ coffee.
A) drink
B) drinks *

2. I ___ tired.
A) am *
B) is

Let me know if you need more!`)

    expect(result.errors).toEqual([])
    expect(result.questions.map((q) => q.text)).toEqual(['He ___ coffee.', 'I ___ tired.'])
    expect(result.questions[1].options).toHaveLength(2)
  })

  it('strips markdown bold, bullets, code and italic', () => {
    const result = parseQuizText(`**1. What is \`this\`?**
- A) a *nice* pen
- B) **an apple** *
• C) a house`)

    expect(result.errors).toEqual([])
    expect(result.questions[0].text).toBe('What is this?')
    expect(result.questions[0].options.map((o) => o.text)).toEqual(['a nice pen', 'an apple', 'a house'])
    expect(correctOf(result.questions[0])).toEqual(['an apple'])
  })

  it('reads an "Answer: B" line after the options', () => {
    const result = parseQuizText(`Question 1: Where ___ you from?
A) is
B) are
C) am
Answer: B

Savol 2.
Choose the right word:
A) went
B) go
**Correct answer:** A

3 - I ___ a student.
A) am
B) is
Javob: A) am`)

    expect(result.errors).toEqual([])
    expect(result.questions.map(correctOf)).toEqual([['are'], ['went'], ['am']])
    expect(result.questions[1].text).toBe('Choose the right word:')
  })

  it('accepts lowercase letters and "A." / "(A)" / "A -" styles', () => {
    const result = parseQuizText(`1) Pick one
a. one
b. two *
2. Pick another
(A) three
(B) ✅ four
3. And another
A - five (correct)
B - six
4. Last
A: seven
* B: eight`)

    expect(result.errors).toEqual([])
    expect(result.questions.map(correctOf)).toEqual([['two'], ['four'], ['five'], ['eight']])
  })

  it('handles Windows line endings and questions with no blank line between them', () => {
    const result = parseQuizText('1. One?\r\nA) x *\r\nB) y\r\n2. Two?\r\nA) x\r\nB) y *\r\n\r\n\r\n')
    expect(result.errors).toEqual([])
    expect(result.questions.map(correctOf)).toEqual([['x'], ['y']])
  })

  it('does not take a * in the question or a ___ blank as the correct marker', () => {
    const result = parseQuizText(`1. 2 * 3 = ___ ?
A) 5
B) 6 *`)
    expect(result.questions[0].text).toBe('2 * 3 = ___ ?')
    expect(correctOf(result.questions[0])).toEqual(['6'])
  })

  it('reports a question with no correct answer, keeping the others', () => {
    const result = parseQuizText(`1. First
A) a
B) b

2. Second
A) a *
B) b`)
    expect(result.errors).toEqual([{ questionNumber: 1, message: 'toʻgʻri javob belgilanmagan' }])
    expect(result.questions.map((q) => q.text)).toEqual(['Second'])
  })

  it('reports two correct answers', () => {
    const result = parseQuizText(`1. First
A) a *
B) b *`)
    expect(result.errors).toEqual([{ questionNumber: 1, message: 'bir nechta toʻgʻri javob belgilangan' }])
    expect(result.questions).toEqual([])
  })

  it('reports too few options and an empty question', () => {
    const result = parseQuizText(`1. Only one option
A) a *

2.
A) a *
B) b`)
    expect(result.errors).toEqual([
      { questionNumber: 1, message: 'kamida 2 ta variant kerak' },
      { questionNumber: 2, message: 'savol matni boʻsh' },
    ])
  })

  it('is empty for empty input', () => {
    expect(parseQuizText('')).toEqual({ questions: [], errors: [] })
    expect(parseQuizText('   \n\n  ')).toEqual({ questions: [], errors: [] })
    expect(parseQuizText('Sure, here you go!')).toEqual({ questions: [], errors: [] })
  })
})

describe('buildQuizPrompt', () => {
  it("uses the group's level, topic and count", () => {
    const prompt = buildQuizPrompt({ count: 8, level: 'Elementary', topic: 'Present Simple' })
    expect(prompt).toContain('Create 8 multiple-choice English questions for Elementary level students.')
    expect(prompt).toContain('Topic: Present Simple')
  })

  it('round-trips its own example through the parser', () => {
    const example = buildQuizPrompt({ count: 1, level: 'A1', topic: 'x' }).split('\n').slice(4, 9).join('\n')
    expect(parseQuizText(example).questions).toHaveLength(1)
  })
})
