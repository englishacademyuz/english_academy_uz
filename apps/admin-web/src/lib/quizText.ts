/**
 * Quiz questions pasted as plain text -- typically a ChatGPT/Claude/Gemini answer to the prompt from `buildQuizPrompt`.
 * Pure (no React) so it can be unit tested; the editor maps the result onto its own form state.
 */

export type ParsedQuizOption = { text: string; isCorrect: boolean }
export type ParsedQuizQuestion = { text: string; options: ParsedQuizOption[] }
export type QuizTextError = { questionNumber: number; message: string }

export type QuizTextResult = {
  /** Questions that passed validation, in the order they were pasted. */
  questions: ParsedQuizQuestion[]
  /** One entry per rejected question, numbered as in the pasted text. */
  errors: QuizTextError[]
}

const LETTERS = ['A', 'B', 'C', 'D', 'E', 'F']

/** "1.", "1)", "1 -", "1:", "Question 1:", "Savol 1.", "Q1." */
const QUESTION_RE = /^(?:(?:question|savol|q)\s*)?(\d{1,3})\s*(?:[.):]|\s-|-)\s*(.*)$/i
/** "A)", "A.", "a)", "(A)", "A -", "A:" -- the letter is checked against the expected position separately. */
const OPTION_RE = /^(?:\(([a-f])\)|([a-f])\s*(?:[.):]|\s-(?=\s)))\s*(.*)$/i
/** "Answer: B", "Correct answer: (b)", "Javob: B) goes", "Toʻgʻri javob - B" */
const ANSWER_RE = /^(?:correct\s+answer|right\s+answer|answer|to[ʻ'`’]?g[ʻ'`’]?ri\s+javob|javob)\s*(?:[:\-–—]|\bis\b)\s*\(?([a-f])\b/i
/** An answer key line after the questions: "3. B", "3) (b)". */
const ANSWER_KEY_RE = /^(\d{1,3})\s*[.):-]\s*\(?([a-f])\)?\.?$/i

const LEADING_MARK_RE = /^(?:\*|✅|✓|✔️?)\s*/
const TRAILING_MARK_RE = /\s*(?:\*|✅|✓|✔️?|\((?:correct(?:\s+answer)?|to[ʻ'`’]?g[ʻ'`’]?ri)\))$/i

/** Markdown that doesn't carry meaning here. Italic `*x*` is left for later so a leading/trailing `*` marker survives. */
function stripLineMarkdown(line: string): string {
  return line
    .replace(/\*\*(.+?)\*\*/g, '$1')
    .replace(/`([^`]*)`/g, '$1')
    .replace(/^#{1,6}\s+/, '')
    .replace(/^(?:[-•]\s+)+/, '')
    .trim()
}

/** `*italic*` inside running text; `___` blanks are untouched because only `*` is treated as emphasis. */
function stripItalic(text: string): string {
  return text.replace(/(^|[\s(])\*(\S(?:[^*]*\S)?)\*(?=$|[\s.,!?;:)])/g, '$1$2').trim()
}

/** Pulls start/end correct-answer markers off an option's text. */
function readOption(raw: string): ParsedQuizOption {
  let text = raw.trim()
  let isCorrect = false
  for (;;) {
    const lead = text.match(LEADING_MARK_RE)
    if (lead) {
      text = text.slice(lead[0].length)
      isCorrect = true
      continue
    }
    const trail = text.match(TRAILING_MARK_RE)
    if (trail) {
      text = text.slice(0, -trail[0].length)
      isCorrect = true
      continue
    }
    break
  }
  return { text: stripItalic(text), isCorrect }
}

type Draft = { number: number; text: string; options: ParsedQuizOption[]; answerLetters: string[] }

function problemOf(draft: Draft): string | null {
  if (!draft.text.trim()) return 'savol matni boʻsh'
  if (draft.options.length < 2) return 'kamida 2 ta variant kerak'
  if (draft.options.some((o) => !o.text)) return 'boʻsh variant bor'
  for (const letter of draft.answerLetters) {
    if (LETTERS.indexOf(letter) >= draft.options.length) return `javobdagi "${letter}" varianti yoʻq`
  }
  const correct = draft.options.filter((o) => o.isCorrect).length
  if (correct === 0) return 'toʻgʻri javob belgilanmagan'
  if (correct > 1) return 'bir nechta toʻgʻri javob belgilangan'
  return null
}

export function parseQuizText(input: string): QuizTextResult {
  const drafts: Draft[] = []
  let current: Draft | null = null

  for (const rawLine of input.replace(/\r\n?/g, '\n').split('\n')) {
    const line = stripLineMarkdown(rawLine.replace(/\s+/g, ' '))
    if (!line) continue

    // A leading marker may sit before the letter ("* B) goes", "✅ B) goes").
    const lead = line.match(LEADING_MARK_RE)
    const bare = lead ? line.slice(lead[0].length) : line
    const optionMatch = bare.match(OPTION_RE)
    if (current && optionMatch) {
      const letter = (optionMatch[1] ?? optionMatch[2]).toUpperCase()
      if (letter === LETTERS[current.options.length]) {
        const option = readOption(optionMatch[3])
        current.options.push({ ...option, isCorrect: option.isCorrect || !!lead })
        continue
      }
    }

    const answer = line.match(ANSWER_RE)
    if (current && answer) {
      current.answerLetters.push(answer[1].toUpperCase())
      continue
    }

    const key = line.match(ANSWER_KEY_RE)
    const keyed = key && drafts.find((d) => d.number === Number(key[1]) && d.options.length > 0)
    if (key && keyed) {
      if (!keyed.options.some((o) => o.isCorrect)) keyed.answerLetters.push(key[2].toUpperCase())
      continue
    }

    const question = bare.match(QUESTION_RE)
    if (question) {
      current = { number: Number(question[1]), text: stripItalic(question[2]), options: [], answerLetters: [] }
      drafts.push(current)
      continue
    }

    // Before any options, extra lines continue the question ("Question 1:" with the text below it).
    // After them, it's the AI's closing chatter -- and before the first question, its intro.
    if (current && current.options.length === 0) {
      current.text = current.text ? `${current.text} ${stripItalic(line)}` : stripItalic(line)
    }
  }

  const questions: ParsedQuizQuestion[] = []
  const errors: QuizTextError[] = []
  for (const draft of drafts) {
    for (const letter of draft.answerLetters) {
      const option = draft.options[LETTERS.indexOf(letter)]
      if (option) option.isCorrect = true
    }
    const problem = problemOf(draft)
    if (problem) errors.push({ questionNumber: draft.number, message: problem })
    else questions.push({ text: draft.text.trim(), options: draft.options })
  }
  return { questions, errors }
}

export function buildQuizPrompt({ count, level, topic }: { count: number; level?: string; topic: string }): string {
  const audience = level ? `${level} level students` : 'students'
  return `Create ${count} multiple-choice English questions for ${audience}.
Topic: ${topic.trim() || '(any)'}
Use EXACTLY this format, with no introduction, no explanations, no markdown, no bold text:

1. She ___ to school every day.
A) go
B) goes *
C) going
D) gone

2. Next question...

Rules:
- Each question has 4 options (A, B, C, D).
- Mark exactly one correct answer with * at the end of the line.
- Leave one empty line between questions.`
}
