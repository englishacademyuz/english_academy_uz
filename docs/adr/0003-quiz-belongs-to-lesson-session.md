# A Quiz belongs to one LessonSession, not to a reusable quiz bank

The requirements (§23) and the original domain model describe a Quiz that is written once and handed to any number of Groups through a QuizAssignment. That is not how teachers here actually work: a teacher writes a short quiz during or after a particular lesson, sends it to that one group the same day, and expects to find it — and its results — again when revisiting that lesson later.

So a Quiz is owned by one LessonSession (and through it, one Group and date), and QuizAssignment is dropped. Results are QuizAttempts shown next to that lesson's marks, not AssessmentResult rows, so a quiz score has exactly one source of truth.

Trade-off accepted: the same quiz for two groups means writing it twice. If that becomes common, the fix is a "copy to another lesson" action that duplicates the questions — not reintroducing shared quizzes, which would make per-lesson review ambiguous.

Status: accepted
