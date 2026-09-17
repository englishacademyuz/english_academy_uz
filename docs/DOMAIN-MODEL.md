# Domain Model — Study Center Management System (V1)

This document is the structural companion to [`CONTEXT.md`](../CONTEXT.md) (which defines the terms) and the requirements document's [§51 V1 Decisions](../Study%20Center%20Management%20System%20—%20Product%20&%20Business%20Requirements.md). It covers entities, value objects, relationships, aggregates, ownership, lifecycles, and the business rules that bind them. No code is written against this yet.

---

## 1. Entities

Entities beyond the requirements' own §40 list are marked **(new)** — they were introduced to make the §51 decisions concrete.

| Entity | Identity | Notes |
|---|---|---|
| User | account id | Auth identity; optionally linked from Student/Parent/Teacher |
| Student | student id | Never deleted; status lifecycle (§4) |
| Parent | parent id | |
| Teacher | teacher id | One per Group in V1 |
| ParentStudentLink **(new)** | link id | Many-to-many join with soft revocation |
| LinkingCode **(new)** | code | One-time Telegram identity binding |
| Subject | subject id | |
| Course | course id | belongs to Subject |
| Level | level id | belongs to Course; owns AssessmentCategory set |
| Group | group id | belongs to Level; one Teacher |
| Enrollment | enrollment id | Student × Group, time-bounded |
| LessonSession | session id | one dated Group occurrence |
| LessonMaterial | material id | child of LessonSession |
| Homework | homework id | child of LessonSession |
| HomeworkResult | result id | Student × Homework, entered later |
| Attendance | attendance id | Student × LessonSession |
| AssessmentCategory | category id | scoped to Level; retired, not deleted |
| Assessment | assessment id | single-category grading event (ADR-0001) |
| AssessmentResult | result id | Student × Assessment |
| Quiz | quiz id | authored once |
| QuizAssignment **(new)** | assignment id | Quiz × Group |
| QuizQuestion / QuizOption | ids | content of Quiz |
| QuizAttempt | attempt id | Student × Quiz, capped at one |
| QuizAnswer | answer id | child of QuizAttempt |
| PointTransaction | transaction id | append-only ledger entry |
| Reward | reward id | recorded achievement |
| Payment | payment id | Student × calendar month |
| Notification | notification id | lightweight, per User |

**Progress is deliberately absent from this table.** It is a calculated read model over Attendance, HomeworkResult, AssessmentResult, QuizAttempt, and PointTransaction — see §7.

## 2. Value Objects

| Value Object | Shape | Used by |
|---|---|---|
| `Money` | amount + currency (UZS) | Payment.amount_due, Payment.amount_paid |
| `DateRange` | start, end | Enrollment period, Progress timeframe queries, QuizAssignment availability |
| `PercentageScore` | raw_score / max_score → percentage | Assessment, Homework, Quiz results — the single place the §51.1 normalization rule lives |
| `AttendanceStatus` | enum: Present / Absent / Late / Excused | Attendance |
| `StudentStatus` | enum: Active / Paused / Inactive / Completed / Left | Student |
| `PaymentStatus` | enum: Debt / Partial / Paid | Payment |

## 3. Relationships

```text
Subject 1──* Course 1──* Level 1──* Group *──1 Teacher
                                     │
                                     │ 1
                                     │
                                     *
                                Enrollment *──1 Student
                                                  │ *
                                                  │
                                     ParentStudentLink *──1 Parent
                                                  │
                                                  * (User link, optional, all three)
                                                Student/Parent/Teacher ── User

Group 1──* LessonSession 1──* LessonMaterial
                    │ 1
                    │
                    *
                 Attendance *──1 Student
                    │
              LessonSession 1──0..1 Homework 1──* HomeworkResult *──1 Student

Level 1──* AssessmentCategory *──* Assessment *──1 Group
                                      │
                                      1
                                      │
                                      *
                              AssessmentResult *──1 Student

Quiz 1──* QuizQuestion 1──* QuizOption
Quiz 1──* QuizAssignment *──1 Group
Quiz 1──* QuizAttempt *──1 Student
QuizAttempt 1──* QuizAnswer *──1 QuizQuestion

Student 1──* PointTransaction *──1 Group   (tagged at time earned, §51.3)
Student 1──* Reward
Student 1──* Payment (one per calendar month)
User 1──* Notification
```

## 4. Aggregates & Consistency Boundaries

Aggregates are kept small and reference each other by ID across boundaries — nothing is nested more than one level deep, matching the "don't over-engineer for 100–150 students" instruction.

| Aggregate root | Owns (child entities, same transaction) | References by ID only |
|---|---|---|
| **Student** | — (flat) | — |
| **Parent** | — | — |
| **Teacher** | — | — |
| **ParentStudentLink** | — | Parent, Student |
| **LinkingCode** | — | Student or Parent (target) |
| **Level** | AssessmentCategory (list) | Course |
| **Group** | — (schedule config only) | Level, Teacher |
| **Enrollment** | — | Student, Group |
| **LessonSession** | LessonMaterial (list), Homework, Attendance (list) | Group, Teacher |
| **HomeworkResult** | — | Homework, Student |
| **Assessment** | AssessmentResult (list) | Group, AssessmentCategory |
| **Quiz** | QuizQuestion → QuizOption, QuizAssignment (list) | Group (via assignment) |
| **QuizAttempt** | QuizAnswer (list) | Student, Quiz, QuizAssignment |
| **PointTransaction** | — | Student, Group, source record (optional) |
| **Reward** | — | Student |
| **Payment** | — | Student |
| **Notification** | — | User |

Two design calls worth calling out:

- **Attendance lives inside the LessonSession aggregate** (written together in one "save the lesson" transaction, matching the teacher's daily workflow in §29), while **HomeworkResult is its own aggregate** — it's typically recorded during a *later* session when the teacher checks yesterday's homework, so it has an independent write lifecycle from the LessonSession that assigned the homework.
- **Assessment owns its AssessmentResult rows** because a teacher always enters a whole group's results for one assessment in a single save (§19's "Ali: 85, Madina: 92, Aziz: 76" example) — there's no case where a lone AssessmentResult is created independent of its parent Assessment.

Cross-aggregate invariants (can't be enforced by a single aggregate's own transaction, so they're enforced at the application/database-constraint level):

- "One Active Enrollment per (Student, Subject)" — a partial unique constraint/application check spanning the Enrollment table, not internal to one Enrollment row.
- "One Payment per (Student, calendar month)" — unique constraint on Payment.
- "One QuizAttempt per (Student, Quiz)" — unique constraint on QuizAttempt.

## 5. Ownership (who may create/mutate what)

| Actor | Can write |
|---|---|
| **Admin** | Student, Parent, Teacher, Subject, Course, Level, Group, Enrollment, AssessmentCategory, Quiz content, QuizAssignment, ParentStudentLink, LinkingCode (issue), Reward, Payment |
| **Teacher** | LessonSession/LessonMaterial/Homework/Attendance (own Group only), HomeworkResult, Assessment/AssessmentResult (own Group only), QuizAssignment (choose which of own Groups get a Quiz), PointTransaction (award), Payment |
| **Student** (via Telegram) | QuizAttempt, QuizAnswer — the *only* write path a Student has |
| **Parent** | nothing — read-only |
| **System** | PointTransaction (auto-award on quiz completion per configured defaults), Notification |

This is the "teacher controls, platform presents" principle (requirements §2) made structural: Student and Parent have exactly one write path each in the whole model (a quiz attempt), everything else is Teacher/Admin-authored.

## 6. Lifecycle & State Transitions

**Student.status**

```text
Active ⇄ Paused
Active → Inactive → Active   (reactivation without a status-specific block)
Active/Paused/Inactive → Completed
Active/Paused/Inactive → Left
Completed/Left → Active      (re-enrollment: same person returns, gets a new Enrollment)
```
Completed and Left are not modeled as permanently terminal — a returning student is the same physical person (same Parent links, same point history), so status can move back to Active and a fresh Enrollment is opened, rather than creating a duplicate Student record.

**Enrollment.status**

```text
Active → Ended (end_reason: GroupChange | StudentLeft | Completed | Other)
```
Never deleted or overwritten; a group change always closes one Enrollment and opens a new one on the same day.

**Payment.status**

```text
Debt → Partial → Paid
Debt → Paid   (paid in full in one go)
```
No forward-only lock — an Admin/Teacher can freely correct a status (§51.5: no audit trail in V1).

**QuizAttempt**

```text
(no row) → InProgress (created on first answer submitted)
InProgress → Completed (all questions answered; score finalized)
```
The one-attempt cap applies once `Completed`. **Flagged assumption:** an `InProgress` attempt that the student abandons mid-quiz does not consume the one-attempt slot — they can resume it later (matches Telegram's one-question-at-a-time flow, where losing progress on a dropped connection would otherwise permanently lock a student out of a quiz). This wasn't covered in the grilling session; confirm before implementation if this default is wrong.

**AssessmentCategory**

```text
Active → Retired
```
Retiring stops a category from being offered on new Assessments for that Level; it is never deleted once any AssessmentResult references it (§51.2 versioning).

**ParentStudentLink**

```text
Active (linked_at set) → Revoked (unlinked_at set)
```
Never hard-deleted — preserves a record that access existed for a given period, which matters for a system whose data subjects are largely minors.

**LinkingCode**

```text
Issued → Consumed | Expired
```

## 7. Progress: explicitly not a persisted entity

Per requirements §39/§50 (single source of truth) and §51.1 (no blended score), **Progress has no table**. It is always a query over date-ranged slices of Attendance, HomeworkResult, AssessmentResult, QuizAttempt, and PointTransaction, parameterized by:

- **Student** (and, when the request is group-scoped, which Enrollment/Group)
- **Timeframe**: today / this week / this month / course duration / since enrollment / custom range (§44)

This is the one entity in the "pay special attention to" list that intentionally has zero rows of its own.

## 8. Key Business Rules

1. A Student holds at most one Active Enrollment per Subject at a time (§51.2).
2. Enrollment history is never deleted; a group change closes one Enrollment and opens another (§9, §41).
3. An Assessment is single-category (ADR-0001); AssessmentCategory sets are versioned per Level so historical Assessments keep the category set active at creation time (§51.2).
4. All scores normalize to percentage (`PercentageScore`) before any cross-scale aggregation (§51.1).
5. Homework performance % excludes ungraded (status-only) completions (§51.1).
6. Attendance %: Present/Late = full credit, Absent = 0, Excused is excluded from the denominator (§51.1).
7. PointTransaction is append-only and immutable; always tagged with the Group active when earned (§51.3).
8. A Group's leaderboard only sums PointTransactions tagged to that Group, defaulting to the current calendar month (§51.3).
9. Rewards never deduct or reset points (§51.3).
10. Payment is one row per (Student, calendar month); no automatic debt rollover, but a derived "total outstanding" is computed across all months (§51.4).
11. Both Teacher and Admin may write Payment records (§51.4).
12. QuizAttempt is capped at one *completed* attempt per (Student, Quiz) (§51.2).
13. A Quiz can be assigned to multiple Groups via QuizAssignment; attempts and scores are tracked per assignment context (§51.2).
14. Parent access to a Student's historical data survives Inactive/Paused/Left/Completed status changes; only an explicit admin unlink removes it (§51.5).
15. Parent↔Student is many-to-many (§51.5).
16. Telegram identity linking requires an admin-issued LinkingCode (§51.5).
17. Students/Parents never see another Group's data or a center-wide ranking — every group-scoped query filters by the Student's own Enrollment (§37).
18. No audit trail on record corrections in V1 — edits overwrite in place (§51.5).
19. Progress is always computed on read, never stored as a maintained running total (§39, §50).
20. Academic progress is never combined across Subjects into one number; only points combine into a single lifetime total (§51.6).

## 9. Capability Coverage

| Required capability | How the model supports it |
|---|---|
| Students changing groups | `Enrollment` (multiple time-bounded rows per Student); reports split per-Enrollment for the period a student actually spent in each Group |
| Inactive students | `StudentStatus` enum; daily teacher lists filter to Active; nothing is deleted |
| Historical records | Nothing is hard-deleted — Enrollment/AssessmentCategory/ParentStudentLink close or retire instead |
| Multiple children per parent / multiple parents per child | `ParentStudentLink` many-to-many |
| Different assessment categories per level | `AssessmentCategory` scoped to `Level`, versioned |
| Future subjects | `Subject → Course → Level → Group` hierarchy; nothing English-specific in the schema |
| Teacher-controlled marks | Teacher is the sole writer of Attendance/HomeworkResult/AssessmentResult/LessonSession (§5) |
| Telegram quiz results | `QuizAttempt`/`QuizAnswer` — the Student's only write path |
| Group-only rankings | `PointTransaction.group` tag + always-group-scoped leaderboard queries (§37) |
| Payment/debt status | `Payment` aggregate, one per month, `PaymentStatus` enum, derived outstanding total |
| Time-based progress calculation | `Progress` as a parameterized read model (§7), never persisted |

## 10. Open Items Flagged During Modeling

- **QuizAttempt abandonment** (§6): default is "doesn't consume the attempt slot until Completed" — flagged, not yet confirmed as a business decision.
- **No "cancelled lesson" tracking**: if a scheduled LessonSession doesn't happen, no row is created — there's no way to distinguish "lesson didn't happen" from "teacher hasn't entered it yet." Out of scope unless the center needs it.
- **No reusable "Lesson" template/syllabus entity** (see CONTEXT.md's LessonSession note): a Group's recurring schedule (days/time) is the only source of "when lessons happen"; there's no separate curriculum-content entity distinct from the dated LessonSession. Adding one later (e.g., a syllabus of planned topics per Level) is a low-cost addition, not a breaking change.
