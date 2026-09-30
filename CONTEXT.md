# Study Center Management System

Single bounded context: one backend serving the Admin/Teacher web panel and the Telegram bot for students — which parents use too, viewing the same student (requirements §38, §50; see docs/adr/0002). The system is not split into sub-contexts for V1 — there is no `CONTEXT-MAP.md` because there is only one context.

## Language

### People & Identity

**User**:
An admin-panel login (Admin or Teacher). Telegram access is not a User — it is a TelegramLink.
_Avoid_: Account

**Student**:
A person enrolled to study at the center. Tracked from enrollment onward regardless of current activity status — a Student record is never deleted.
_Avoid_: Learner, pupil

**Teacher**:
The staff member who owns a Group's academic record-keeping: attendance, marks, homework, lesson content. V1 models exactly one Teacher per Group.
_Avoid_: Instructor, tutor

**LinkingCode**:
A code an admin issues for one Student. Reusable until it expires (24h), so the student and each parent redeem the same code from their own Telegram accounts.
_Avoid_: Invite code, activation code

**Mini App**:
The student-facing app inside Telegram, where a Student (or a parent, seeing the same Student) views lessons, homework, progress, attendance and takes quizzes. The bot itself only links accounts and sends notifications — see [ADR-0004](./docs/adr/0004-telegram-mini-app-for-students.md).
_Avoid_: Student bot (for the browsing interface), web app

**TelegramLink**:
One Telegram chat bound to the Student it may view — created by redeeming that Student's LinkingCode. A Student has any number (their own chat, each parent's); a chat views one Student at a time and is re-pointed by sending another Student's code. The bot never distinguishes a student's chat from a parent's.
_Avoid_: Parent account, bot user

### Academic Structure

**Subject**:
The top-level academic domain the center teaches (English, Mathematics, ...). English is the only Subject in V1, but nothing is hardcoded to it.

**Course**:
A named curriculum within a Subject (e.g., General English).

**Level**:
A proficiency tier within a Course (e.g., Elementary, Intermediate). Owns the set of AssessmentCategories used to grade Students at that tier — different Levels can use entirely different category sets.

**Group**:
A specific cohort of Students studying one Level, taught by exactly one Teacher, on a recurring schedule. Each Level has its own color, and its Groups are painted in it everywhere. A Group is never hard-deleted: "deleting" archives it. It disappears from lists and the timetable, its active Enrollments end, and future Reschedules and empty future LessonSessions are cleared. Everything already recorded stays as history.
_Avoid_: Class, cohort

**Reschedule**:
One regular lesson of a Group moved to another day and/or time (a holiday, an event): the Group does not meet on the original day and meets on the new one instead. The Group's Telegram chats can be told about it when it is saved, or later.
_Avoid_: Cancellation (the lesson still happens, just elsewhere), exception

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
A set of single-choice questions a Teacher writes inside one LessonSession — about that day's topic or anything else — and sends to that Group's Students through Telegram. It stays attached to its LessonSession for later review. It has a maximum point value, and the points a Student earns are proportional to the share of questions they answer correctly.
_Avoid_: Test — Quiz specifically means the Telegram-interactive kind; a physical exam is recorded as an Assessment, not a Quiz. Quiz results are never copied into AssessmentResults.

**Draft / Sent / Closed** (Quiz lifecycle):
A Draft is still being written and can be changed or deleted. Sending freezes its questions, sets a deadline, and notifies the Group. It is Closed once the deadline passes (a Teacher may close it early); no answers are accepted after that.

**QuizAttempt**:
One Student's single, non-retakeable attempt at a Quiz. Anyone linked to the Student in Telegram (the Student or a parent) may take it; whoever starts first uses it. An attempt unfinished at the deadline is scored on what was answered; a Student who never started has no attempt, not a zero.

**QuizAnswer**:
The one option chosen for one question within a QuizAttempt. It cannot be changed once given.

### Points, Rewards & Payments

**PointTransaction**:
An immutable, permanent ledger entry awarding points to a Student for an activity, tagged with the Group the Student belonged to when it was earned. Points are never reset or deducted; "monthly" or "course" totals are always a date-ranged sum over this ledger.
_Avoid_: Point balance, score — points and academic scores are unrelated concepts (requirements §12).

**Reward**:
A recorded achievement (e.g., "Monthly Champion") granted to a Student. Granting one never deducts the points that qualified them for it.
_Avoid_: Prize, gift — the physical prize is just a note on the Reward; there is no inventory.

**Payment**:
One Student's billing record for one monthly cycle (amount due, amount paid, status). Months are tracked independently of one another — an unpaid balance is not automatically rolled into the next month's amount due.
_Avoid_: Invoice, bill

**Payment day**:
The day of the month a Student joined the center (`Student.joinedAt`); each cycle runs a month from that day and is paid at its end, so a Student who joined on 30 September first owes on 30 October. It is per Student, not per Group. A cycle's Payment row is keyed by the month the cycle starts in (the 30 October payment is September's).

**Payment reminder**:
Shown from 3 days before a payment day until that cycle is fully paid: *upcoming* (1–3 days ahead), *due* (the day itself), *overdue* (1–5 days late), then *debtor* (more than 5 days late). Staff can send it to the Student's Telegram chats; the Mini App home screen shows it too.
_Avoid_: Invoice, dunning

**Absence notice**:
Shown on the students list while a Student's latest recorded lesson is one they were marked absent from. The group's Teacher (or an Admin) can send it to the Student's Telegram chats; it stays, marked as sent (`Attendance.absenceNotifiedAt`), until the Student attends a later lesson.

### Cross-Cutting

**Progress**:
Not a stored record — a calculated view over a Student's Attendance, HomeworkResult, AssessmentResult, QuizAttempt, and PointTransaction history for a chosen timeframe (today / week / month / course / custom range). Never persisted as a running total.
_Avoid_: Report, score — Progress is a calculation, not a document.
