# Study Center Management System

Single bounded context: one backend serving the Admin/Teacher web panel and the Telegram bot for students and parents (requirements §38, §50). The system is not split into sub-contexts for V1 — there is no `CONTEXT-MAP.md` because there is only one context.

## Language

### People & Identity

**User**:
An authenticated identity (a linked Telegram account, or an admin-panel login) that one or more profile records — Student, Parent, Teacher — can reference. One User may be linked from more than one profile (e.g., a Teacher who is also a Parent).
_Avoid_: Account

**Student**:
A person enrolled to study at the center. Tracked from enrollment onward regardless of current activity status — a Student record is never deleted.
_Avoid_: Learner, pupil

**Parent**:
A guardian linked to one or more Students, with read-only visibility into each linked child's academic and payment data.
_Avoid_: Guardian (the domain term is Parent; "guardian" may still appear in UI copy)

**Teacher**:
The staff member who owns a Group's academic record-keeping: attendance, marks, homework, lesson content. V1 models exactly one Teacher per Group.
_Avoid_: Instructor, tutor

**ParentStudentLink**:
The many-to-many relationship connecting a Parent to a Student. Created via a redeemed LinkingCode; revocable only by an explicit admin action, never automatically.
_Avoid_: Guardianship, family link

**LinkingCode**:
A one-time code issued by an admin that a Telegram user redeems to bind their account to a specific Student or Parent record.
_Avoid_: Invite code, activation code

### Academic Structure

**Subject**:
The top-level academic domain the center teaches (English, Mathematics, ...). English is the only Subject in V1, but nothing is hardcoded to it.

**Course**:
A named curriculum within a Subject (e.g., General English).

**Level**:
A proficiency tier within a Course (e.g., Elementary, Intermediate). Owns the set of AssessmentCategories used to grade Students at that tier — different Levels can use entirely different category sets.

**Group**:
A specific cohort of Students studying one Level, taught by exactly one Teacher, on a recurring schedule.
_Avoid_: Class, cohort

**Enrollment**:
The time-bounded membership of one Student in one Group. A Student holds at most one *Active* Enrollment per Subject at a time. Ending an Enrollment never deletes it — it is dated closed, and a new Enrollment is opened when the Student moves groups.
_Avoid_: Membership, registration

### Lessons & Academic Work

**LessonSession**:
One actual, dated occurrence of a Group meeting — the unit a Teacher opens to record topic, materials, homework, attendance, and notes for that day.
_Avoid_: Lesson, class, session — the requirements document uses "Lesson" for this same concept; LessonSession is the canonical term, chosen to avoid confusion with a Course's static syllabus content, which this system does not separately model in V1 (there is no reusable "Lesson template" entity — see the domain model's open notes).

**LessonMaterial**:
A file, link, or text resource attached to a LessonSession for Students to view.

**Homework**:
The instructions a Teacher records against a LessonSession (what to do, what to learn, due by when). The Student never submits it through the platform.

**HomeworkResult**:
A Teacher's later, in-person-checked outcome for one Student against one Homework: a completion status, and an optional score.

**Attendance**:
The Teacher-recorded presence status (Present / Absent / Late / Excused) for one Student at one LessonSession.

### Assessment & Quizzes

**AssessmentCategory**:
A configurable skill or grading dimension (Grammar, Speaking, "General Performance", ...) scoped to a Level. Once referenced by any Assessment, a category is retired rather than edited or deleted, so historical reports keep the category set that was active when they were produced.
_Avoid_: Skill, grading category

**Assessment**:
A single-category, Teacher-created grading event for a Group on a date (e.g., "Week 3 — Speaking"). A "Monthly Assessment" spanning several categories is several Assessment rows sharing the same title/type/date/group — see [ADR-0001](./docs/adr/0001-single-category-assessment-rows.md).

**AssessmentResult**:
One Student's score against one Assessment.

**Quiz**:
A set of questions a Teacher authors once and can assign to any number of Groups; each assignment is tracked independently.
_Avoid_: Test — Quiz specifically means the Telegram-interactive kind; a physical monthly exam is recorded as an Assessment, not a Quiz.

**QuizAssignment**:
The link between a Quiz and a Group that makes the quiz available to that group's Students.

**QuizAttempt**:
One Student's single, non-retakeable attempt at a Quiz, taken through Telegram.

**QuizAnswer**:
One Student's selected option for one question within a QuizAttempt.

### Points, Rewards & Payments

**PointTransaction**:
An immutable, permanent ledger entry awarding points to a Student for an activity, tagged with the Group the Student belonged to when it was earned. Points are never reset or deducted; "monthly" or "course" totals are always a date-ranged sum over this ledger.
_Avoid_: Point balance, score — points and academic scores are unrelated concepts (requirements §12).

**Reward**:
A recorded achievement (e.g., "Monthly Champion") granted to a Student. Granting one never deducts the points that qualified them for it.
_Avoid_: Prize, gift — the physical prize is just a note on the Reward; there is no inventory.

**Payment**:
One Student's billing record for one calendar month (amount due, amount paid, status). Months are tracked independently of one another — an unpaid balance is not automatically rolled into the next month's amount due.
_Avoid_: Invoice, bill

### Cross-Cutting

**Progress**:
Not a stored record — a calculated view over a Student's Attendance, HomeworkResult, AssessmentResult, QuizAttempt, and PointTransaction history for a chosen timeframe (today / week / month / course / custom range). Never persisted as a running total.
_Avoid_: Report, score — Progress is a calculation, not a document.
