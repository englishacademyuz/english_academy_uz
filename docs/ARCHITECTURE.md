# Implementation Architecture — Study Center Management System (V1)

Source documents: the requirements doc (incl. §51 V1 Decisions), [`CONTEXT.md`](../CONTEXT.md), [`docs/DOMAIN-MODEL.md`](./DOMAIN-MODEL.md), [ADR-0001](./adr/0001-single-category-assessment-rows.md). This document uses the Codebase Design skill's vocabulary throughout: **module** (interface + implementation), **interface** (everything a caller must know, not just types), **seam** (where an interface lives), **adapter** (what satisfies an interface at a seam), **deep/shallow**, **leverage**, **locality**.

No code is written yet. This is a plan a coding agent can follow.

## Stack assumption (flagged, not yet confirmed)

Nothing in the requirements or domain model mandates a language. This plan assumes **Node.js + TypeScript** end-to-end (backend, bot, admin web), **PostgreSQL** via **Prisma**, **Fastify** for HTTP, **grammY** for Telegram, **React + Vite + TanStack Query + Tailwind** for the admin panel. Rationale: one language across every part of the system minimizes context-switching for a small team, matches a single-backend/no-microservices mandate, and keeps hosting to one Node process + one Postgres instance (a $10–20/mo VPS or a managed Postgres + small compute box is sufficient at 100–150 students). Flag this for confirmation before scaffolding; nothing else in this document depends on the specific language, only on "one deployable process, one relational database."

---

## 1. Project Structure

Single deployable **modular monolith** — not a distributed system. Two thin entry adapters (HTTP, Telegram) share one in-process application/domain layer, which is the direct structural expression of requirements §50's Golden Architecture Rule ("don't duplicate business logic between admin panel, student bot, parent bot").

```text
/apps
  /server              ← the one deployable backend process
    /entry-http        ← Fastify routes, request/response DTOs, auth middleware
    /entry-telegram    ← grammY bot handlers, keyboards, session wiring
    /app                ← application/use-case layer (orchestration, transactions)
  /admin-web            ← React admin/teacher panel (consumes /entry-http's API)

/packages
  /domain               ← pure business-rule modules, no I/O (see §8)
    /enrollment
    /attendance
    /homework
    /assessment
    /points
    /rewards
    /payments
    /quiz
    /progress
    /identity
  /db                    ← Prisma schema, migrations, generated client, query modules
  /shared                 ← value objects (Money, PercentageScore, DateRange), enums, error types
  /notifications           ← Notification module + Telegram-sender port (see §11)

/docs
  DOMAIN-MODEL.md, ARCHITECTURE.md, adr/
```

Two packages that are NOT services: `/packages/domain` and `/packages/db` are libraries imported in-process by `/apps/server`. There is no network hop between the bot, the API, and the domain logic — they are the same process, same memory space, same transaction.

**Deployment**: one Node process (`apps/server`), one Postgres instance, one static build of `admin-web` served from a CDN or the same box. No queue, no cache layer, no container orchestration for V1.

---

## 2. Backend Architecture

Four layers, each a seam a coding agent should respect:

```text
┌─────────────────────────────┐  ┌─────────────────────────────┐
│   entry-http (Fastify)      │  │  entry-telegram (grammY)    │   ← thin entry adapters
└──────────────┬───────────────┘  └──────────────┬───────────────┘
               │                                  │
               └────────────────┬─────────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │   app (use-cases)       │   ← orchestration, transactions,
                    │                         │      authorization checks
                    └────────────┬────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │   domain (pure rules)   │   ← deep modules, no I/O
                    └────────────┬────────────┘
                                 ▼
                    ┌─────────────────────────┐
                    │   db (Prisma/Postgres)   │   ← persistence
                    └─────────────────────────┘
```

- **Entry adapters** (`entry-http`, `entry-telegram`) do presentation only: parse a request/Telegram update, call exactly one use-case function, format the response. No business rule ever lives here — if a coding agent finds itself writing an `if` that encodes a requirement from §51, it belongs in `domain`, not here.
- **Use-cases** (`app`) are named after the thing the actor is doing, not the entity: `RecordLessonSession`, `SubmitQuizAnswer`, `ChangeStudentGroup`, `RecordPayment` — each wraps one Postgres transaction, checks authorization (§5), and calls one or more domain modules.
- **Domain** modules are pure — they receive already-loaded data and simple parameters, and return decisions/computed values. They call `db` query modules to fetch what they need, but the business *rules* (§8 of the domain model) live here, not in `app` or `db`.
- **db** exposes narrow query modules per aggregate (e.g., `getActiveEnrollment(studentId, subjectId)`), not a generic repository interface — see the note on seams below.

**On repository interfaces**: per the skill's seam discipline ("one adapter means a hypothetical seam"), this plan does **not** introduce an abstract repository interface over Prisma. Postgres is the only production adapter and tests run against real Postgres too (see §12) — a swappable-repository abstraction would be a seam with no second adapter, i.e. pure indirection. Domain modules call `db` query functions directly.

---

## 3. Database Structure

One Postgres schema, tables mapping directly onto the domain model's entities (`docs/DOMAIN-MODEL.md` §1). Money is a single currency (UZS) — no currency column; flagged simplification, add one only if the center ever bills in multiple currencies.

| Table | Key columns | Constraints |
|---|---|---|
| `users` | id, role (enum), telegram_chat_id (nullable, unique), password_hash (nullable, admin/teacher only) | |
| `students` | id, first_name, last_name, dob, phone, status (enum), user_id (nullable FK) | |
| `parents` | id, phone, user_id (nullable FK) | |
| `teachers` | id, name, user_id FK | |
| `parent_student_links` | id, parent_id FK, student_id FK, linked_at, unlinked_at (nullable) | |
| `linking_codes` | code (PK), target_type, target_id, issued_at, expires_at, consumed_at (nullable) | |
| `subjects` | id, name | |
| `courses` | id, subject_id FK, name | |
| `levels` | id, course_id FK, name | |
| `assessment_categories` | id, level_id FK, name, retired_at (nullable) | never hard-deleted once referenced |
| `groups` | id, level_id FK, teacher_id FK, name, schedule (jsonb: days+time), start_date, status | |
| `enrollments` | id, student_id FK, group_id FK, start_date, end_date (nullable), status, end_reason (nullable) | partial unique index on (student_id, subject_id) where status='ACTIVE' |
| `lesson_sessions` | id, group_id FK, teacher_id FK, date, topic, notes | |
| `lesson_materials` | id, lesson_session_id FK, type, url_or_text | |
| `homeworks` | id, lesson_session_id FK, instructions, due_date | |
| `homework_results` | id, homework_id FK, student_id FK, status (enum), score (nullable) | |
| `attendances` | id, lesson_session_id FK, student_id FK, status (enum) | unique (lesson_session_id, student_id) |
| `assessments` | id, group_id FK, category_id FK, title, type, date, max_score, teacher_comment | single-category rows, ADR-0001 |
| `assessment_results` | id, assessment_id FK, student_id FK, score | |
| `quizzes` | id, title, frequency_type | |
| `quiz_questions` | id, quiz_id FK, text, order | |
| `quiz_options` | id, question_id FK, text, is_correct | |
| `quiz_assignments` | id, quiz_id FK, group_id FK, available_from, available_until (nullable) | |
| `quiz_attempts` | id, student_id FK, quiz_id FK, quiz_assignment_id FK, status (enum), score (nullable), started_at, completed_at (nullable) | unique (student_id, quiz_id) where status='COMPLETED' |
| `quiz_answers` | id, quiz_attempt_id FK, question_id FK, selected_option_id FK | unique (quiz_attempt_id, question_id) |
| `point_transactions` | id, student_id FK, group_id FK, amount, reason, source_type, source_id (nullable), awarded_by, created_at | **append-only**: no UPDATE/DELETE grants for the app role; consider a DB trigger that rejects both |
| `rewards` | id, student_id FK, title, period, points_at_time, awarded_by, awarded_at, note | |
| `payments` | id, student_id FK, year, month, amount_due, amount_paid, status (enum), recorded_by, recorded_at, notes | unique (student_id, year, month) |
| `notifications` | id, user_id FK, type, payload (jsonb), created_at, read_at (nullable) | |

Historical accuracy is achieved by never deleting rows: `enrollments.end_date`, `assessment_categories.retired_at`, `parent_student_links.unlinked_at` close a record instead of removing it, matching §41 and the domain model's lifecycle section.

---

## 4. API Boundaries

The HTTP API (`entry-http`) is consumed **only by `admin-web`** in V1. The Telegram bot does not call this API — it calls the same `app` use-case functions in-process (§1, §2). This avoids maintaining two parallel API surfaces for one set of business rules. If the bot is ever split into its own deployable (e.g., to scale independently), `app` becomes the seam: define a port there and add an HTTP/gRPC adapter — a "remote but owned" seam per the Deepening categories — but this is explicitly **not needed now** (YAGNI) and costs nothing to defer, since `app` is already decoupled from `entry-http`.

Representative resource groups (not exhaustive — a coding agent fills in CRUD detail per resource):

```text
POST   /auth/login                         Admin/Teacher session login

GET    /students                           list (filter by status, group)
POST   /students
GET    /students/:id
PATCH  /students/:id                       status transitions, profile edits
POST   /students/:id/linking-code          issue a Telegram LinkingCode

GET    /groups
POST   /groups
GET    /groups/:id
POST   /groups/:id/enrollments             enroll a student
PATCH  /enrollments/:id                     end/close (group change, leave)

GET    /groups/:id/sessions?date=          today's LessonSession (or create-on-open)
POST   /groups/:id/sessions                 record topic/materials/homework/attendance in one call
POST   /sessions/:id/homework-results       record checked homework for prior session

POST   /groups/:id/assessments              create + enter AssessmentResults in one call (§19 pattern)
GET    /groups/:id/assessments?from=&to=

POST   /quizzes                             author quiz + questions/options
POST   /quizzes/:id/assignments             assign to group(s)

GET    /students/:id/progress?timeframe=    the Progress read model (§9)
GET    /groups/:id/leaderboard              group-scoped, points, this month

POST   /payments                            record a month's payment
GET    /students/:id/payments

GET    /reports/student/:id
GET    /reports/group/:id
GET    /reports/monthly?year=&month=
```

The `POST /groups/:id/sessions` and assessment-creation endpoints are deliberately **coarse-grained** (one call saves topic + homework + attendance, or an assessment + all its results) — this mirrors the teacher's actual save action (§29) and avoids forcing five round-trips for what is, to the teacher, one action.

---

## 5. Authentication & Authorization

Two identity paths feeding one authorization model:

- **Admin/Teacher**: username + password (bcrypt) → session or short-lived JWT. Role: `ADMIN | TEACHER`.
- **Student/Parent**: Telegram `chat_id` resolved to a `User` via a redeemed `LinkingCode` (domain model §6). No password — Telegram's own sender identity is the credential. Role: `STUDENT | PARENT`.

Every entry adapter resolves the caller into one shared shape before calling a use-case:

```ts
type Actor = { userId, role, studentId?, parentId?, teacherId? }
```

Authorization is one small, deep module: `can(actor: Actor, action: Action, resource: ResourceRef): boolean`. This is the interface a coding agent should build against — not scattered `if (actor.role === 'TEACHER' && ...)` checks in every use-case. Behind that one function:

- Teacher actions on Group-scoped resources (LessonSession, Attendance, Assessment, Homework) additionally require `group.teacher_id === actor.teacherId` (ownership), consistent with V1's one-teacher-per-group model (domain model §4).
- Student queries are implicitly scoped to `actor.studentId`.
- Parent queries are scoped to the set of `student_id`s reachable via their **active** `parent_student_links` rows only (`unlinked_at IS NULL`) — this is where §37's "never expose another student's data" and §51.5's "access survives status changes, revoked only by explicit unlink" both live, in one place.

---

## 6. Telegram Bot Architecture (`entry-telegram`)

- **Library**: grammY, **webhook mode**, mounted as a route on the same Fastify server (`POST /telegram/webhook`) — one public HTTPS endpoint serves both the admin panel and the bot, avoiding a second process or a long-polling loop to manage.
- **Role resolution middleware**: every incoming update resolves `telegram_chat_id → Actor` (§5) before any handler runs. Unrecognized chat IDs are prompted only to redeem a `LinkingCode`; no other command is reachable until linked.
- **Menu design**: a fixed, shallow keyboard per role (§5 of requirements — "avoid complicated menu structures"), each button mapping to exactly one use-case call. The bot layer's job is formatting a `ProgressSnapshot`/`Attendance`/etc. into a Telegram message — never computing one.
- **Quiz-taking is a stateful conversation, but the state lives in the database, not a session store.** "Which question is next" is derived from `count(quiz_answers where quiz_attempt_id = X)`, not a separately tracked pointer. This means a dropped Telegram connection mid-quiz is naturally resumable — it directly implements the domain model's flagged QuizAttempt-resumability assumption (`docs/DOMAIN-MODEL.md` §6/§10) with no extra machinery. grammY's session middleware is used only for genuinely disposable UI convenience (e.g., a parent's "currently selected child" for the duration of a conversation) — never for anything that would be a problem to lose on restart.
- **Notifications** are pushed to the bot via the Notification module (§11), not the reverse — the bot doesn't poll for anything.

---

## 7. Admin Panel Architecture (`admin-web`)

- React + TypeScript + Vite, TanStack Query for server state (matches the API's resource shape directly — no separate client-side domain logic; all business rules stay server-side per §50), Tailwind for styling.
- **Navigation mirrors the teacher's actual workflow, not the database schema** (requirements §30 is explicit about this): the primary route is `Dashboard → Today's Schedule → Group → Today's Lesson`, a single guided flow, not a sidebar of "Students / Assessments / Attendance / Homework" as five separate destinations to visit per lesson. The coarse-grained `POST /groups/:id/sessions` endpoint (§4) exists specifically to make this one screen, one save.
- Secondary routes (`/students`, `/students/:id`, `/payments`, `/quizzes`, `/reports`) exist for the less-frequent admin/management tasks (enrollment, payment recording, quiz authoring, reporting) — these can be conventional CRUD screens since they aren't part of the daily hot path.
- Admin-only vs Teacher-visible routes are gated client-side for UX but **never trusted client-side** — every route's data still passes through `can()` (§5) server-side.

---

## 8. Domain/Business Logic Boundaries

Each of the following is a **deep module** in `/packages/domain`: a small interface, the actual §51 business rules behind it, no I/O of its own beyond calling narrow `db` query functions it's given the data from.

| Module | Interface (representative) | Hides |
|---|---|---|
| `enrollment` | `enroll()`, `endEnrollment()`, `changeGroup()` | one-active-enrollment-per-subject invariant, end-and-reopen instead of edit |
| `attendance` | `recordAttendance()`, `calculateAttendanceRate()` | Present/Late=credit, Excused=excluded-from-denominator math |
| `assessment` | `recordAssessmentResults()`, `calculateCategoryAverages()` | PercentageScore normalization, single-category-row grouping into an "Overall" (ADR-0001) |
| `homework` | `assignHomework()`, `recordHomeworkResult()`, `calculateHomeworkRate()` | ungraded-completions-excluded rule |
| `points` | `awardPoints()`, `sumPoints()` | append-only ledger, group-tagging (§51.3) |
| `rewards` | `grantReward()` | no point deduction |
| `payments` | `recordPayment()`, `getOutstandingBalance()` | per-month independence + derived total-outstanding |
| `quiz` | `assignToGroup()`, `startOrResumeAttempt()`, `submitAnswer()`, `completeAttempt()` | one-attempt cap, DB-derived resumability, grading, triggers `points.awardPoints()` atomically on completion |
| `identity` | `issueLinkingCode()`, `redeemLinkingCode()`, `linkParentToStudent()`, `resolveActor()` | Telegram-identity binding, many-to-many parent-child |
| `progress` | see §9 | composition of the above into one read model |

**The deletion test** justifies each of these as real modules rather than pass-throughs: delete `attendance`, and the Late/Excused rule has to be reimplemented at every call site that shows an attendance percentage (teacher dashboard, student profile, parent view, monthly report) — four places minimum. That's exactly the locality argument for keeping it one deep module.

None of these modules take an abstract repository port (§2's note) — they take plain data (already fetched by a `db` query function) or call a `db` query function directly. The only real ports & adapters seam in the whole backend is the Telegram sender in §11, because that's the only place two genuinely different adapters (real Telegram, test fake) are needed.

---

## 9. Progress Calculation Architecture

The single deepest module in the system, and the one explicitly required to never be a stored value (§39, §50, `docs/DOMAIN-MODEL.md` §7).

```ts
type Timeframe =
  | { kind: 'today' | 'week' | 'month' | 'course' | 'sinceEnrollment' }
  | { kind: 'custom', range: DateRange }

function getProgress(studentId: string, timeframe: Timeframe, groupId?: string): ProgressSnapshot

type ProgressSnapshot = {
  timeframe: Timeframe
  attendanceRate: number | null
  homeworkRate: number | null
  quizAverage: number | null
  academicByCategory: Record<string /* AssessmentCategory name */, number>
  points: number   // always lifetime, all groups — §51.6, independent of `timeframe`
}
```

- **One entry point, several call sites**: the student profile screen, the parent view, the teacher's group-statistics screen (§36), and the group leaderboard (§10/§21) are all the same function with different `groupId`/`timeframe` arguments — not four separate implementations. This is the leverage argument for treating Progress as one module rather than letting each screen compute its own averages.
- **Implementation** fans out to `attendance.calculateAttendanceRate()`, `homework.calculateHomeworkRate()`, `assessment.calculateCategoryAverages()`, one quiz-average query, and `points.sumPoints()` — each scoped by the same `(studentId, dateRange, groupId?)` triple — then composes the results into one `ProgressSnapshot`. No new business rule lives in `progress` itself; it's purely a composer, which is why it stays deep without becoming a god-module: each sub-rule's complexity is already hidden one level down.
- **No caching/materialization in V1.** At 100–150 students, every query here is a scan of at most a few thousand rows with proper indexes on `(student_id, date)` / `(group_id, date)`. Add a materialized view or scheduled rollup only if a specific report is measured to be slow — not preemptively.
- **Never a single blended number** (§51.1 decision) — `ProgressSnapshot` has no `overall` field. If the center later asks for one, it's an explicit new field with a named formula, not an implicit average of the others.

---

## 10. Quiz Architecture

- **Authoring** (admin/teacher, via `admin-web`): `Quiz` + `QuizQuestion` + `QuizOption` created together, then assigned to one or more groups via `QuizAssignment` — independent per-group availability windows.
- **Delivery** (Telegram, via `entry-telegram`): on the student choosing "🧠 Quizzes," the bot lists `QuizAssignment`s currently available for the student's active group(s) with no existing `Completed` `QuizAttempt`. Selecting one calls `quiz.startOrResumeAttempt(studentId, quizId)`, which either creates a new `InProgress` attempt or resumes an existing one at `count(answers)`-th question (§6).
- **Answering**: each Telegram button press calls `quiz.submitAnswer(attemptId, questionId, optionId)` — one `QuizAnswer` row per call, unique per `(attemptId, questionId)` so a double-tap can't record two answers to the same question.
- **Completion**: once the last question is answered, `quiz.completeAttempt(attemptId)` runs in one transaction: compute score/percentage, mark `Completed`, call `points.awardPoints()` for the configured quiz-completion default (§51.3's teacher-overridable default applies at assignment time, not per-attempt, since there's no teacher in the loop during a Telegram quiz). Score and points-awarded are returned to the bot for the "🎉 Quiz completed!" message.
- **One-attempt enforcement** is both a DB constraint (`unique (student_id, quiz_id) where status='COMPLETED'`) and an application check before creating a new attempt — belt and suspenders, since this is a rule a center will care about being airtight (§51.2 retake decision).

---

## 11. Notification Architecture

- One module, `notifications`, with a single call site shape: `notify(userId, type, payload)`.
- Two responsibilities behind that one call: (1) persist a `Notification` row (audit trail, and groundwork for an in-app "inbox" later if wanted), (2) best-effort push to Telegram if the user has a linked `chat_id`.
- **This is the one true ports-and-adapters seam in the backend** (Deepening category 4: true external dependency). The module takes an injected `TelegramSender` port:
  ```ts
  interface TelegramSender { send(chatId: string, message: string): Promise<void> }
  ```
  Production wires the real grammY bot instance; tests inject a fake that records calls. Two adapters genuinely exist here (production, test), which is exactly when a port earns its keep per the skill's seam discipline — unlike the DB layer (§2), where only one adapter will ever exist.
- **Delivery failure never blocks the triggering write.** The state change (homework recorded, quiz completed, payment flagged) has already committed by the time `notify()` runs; a Telegram send failure is logged and retried once, then dropped — never rolled back into the caller's transaction.
- **Every notification in the system goes through this one call site** (never an ad hoc `bot.sendMessage()` from inside a use-case) — this is what makes §35's "don't send excessive notifications" enforceable centrally later (throttling, batching, digesting) without hunting down scattered send calls.
- No queue/broker for V1 — direct async call from the use-case layer, right after the transaction commits.

---

## 12. Testing Strategy

Aligned with the Deepening skill's "replace, don't layer" discipline: tests sit at each module's real interface, not scattered mocks of internals.

| Layer | Dependency category | How it's tested |
|---|---|---|
| `domain/*` (enrollment, attendance, assessment, homework, points, rewards, payments, quiz, progress) | Local-substitutable (Postgres) | Against a real local Postgres (docker-compose service or testcontainers), seeded per test. No repository mocks — the whole point of these modules is correct querying/aggregation, which mocks can't validate. |
| `identity` (LinkingCode, ParentStudentLink, `resolveActor`, `can()`) | Local-substitutable (Postgres) | Same as above — access-control correctness is exactly the kind of thing that must be tested against real relational constraints. |
| `notifications` | True external (Telegram Bot API) | `TelegramSender` port mocked; assert the right `notify()` calls happen at the right use-case points, and that a send failure doesn't roll back the triggering transaction. |
| `entry-http`, `entry-telegram` | N/A — thin adapters | A handful of integration tests per adapter verifying request/update → correct use-case call → correct response shape, and that `can()` is actually invoked (authorization wiring), not re-testing business rules already covered at the domain layer. |
| `admin-web` | N/A | Component/interaction tests for the daily-workflow screens (§7) only; no need to duplicate server-side rule testing in the frontend. |

**What NOT to test in depth**: plain CRUD passthroughs with no business rule (e.g., creating a `Subject`/`Course` record) — apply the deletion test first; if deleting the "module" around a CRUD operation loses nothing but a database insert, a single smoke test is enough, not a full suite.

**No load/performance testing in V1** — 100–150 students is well within a single Postgres instance's trivial-query range; revisit only if a specific report is later measured to be slow.

---

## Summary for a coding agent

Build order that keeps every step demoable and matches the requirements' own phasing (§47):

1. `packages/db` schema (§3) + `packages/shared` value objects.
2. `packages/domain/identity` + auth (§5) — nothing else is reachable without it.
3. `packages/domain/enrollment`, `attendance`, `homework`, `assessment` + the corresponding `entry-http` routes and `admin-web` daily-workflow screen (§7) — this alone delivers the "teacher runs a normal day" success criterion (requirements §48).
4. `packages/domain/progress` (§9), surfaced on student/parent Telegram views and the teacher group-statistics screen.
5. `entry-telegram` (§6) for Student/Parent read access + `identity` linking flow.
6. `packages/domain/quiz` (§10) end-to-end, including Telegram delivery.
7. `packages/domain/points`, `rewards`, `payments` (§8) + leaderboard.
8. `notifications` (§11) wired into the use-cases that already exist from steps 3–7.
