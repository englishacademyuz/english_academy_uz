# Study Center Management System
## Product & Business Requirements — V1

---

# 1. Project Overview

This project is a lightweight management and student progress platform for a study center.

The center initially teaches **English**, with approximately:

- 100–150 students
- 5–6 groups
- 1 teacher initially
- Multiple age groups
- Different English levels

The system should be designed so that additional teachers, groups, and subjects can be added later without redesigning the core architecture.

The platform consists of:

1. **Admin / Teacher Web Panel**
2. **Telegram Bot for Students and Parents**
3. **Backend API**
4. **Database**

The system is primarily **one-way academic data flow**:

```text
Teacher / Admin
      |
      | creates and updates
      v
   Backend
      |
      +--------------------+
      |                    |
      v                    v
 Student Bot          Parent Bot/View
```

Students and parents primarily **view information**.

Students do **not** upload homework or assignments.

Teachers check homework, tasks, participation, and other classroom performance physically during lessons and enter the result into the platform.

The main exception is **interactive quizzes/tests**, which students can complete directly through Telegram.

---

# 2. Core Business Principle

The system must be built around the following principle:

> **The teacher controls and records academic information. The platform stores, calculates, and presents it.**

The platform should reduce the teacher's administrative work, not create additional work.

For example:

```text
Teacher teaches lesson
        ↓
Teacher opens group
        ↓
Teacher marks students
        ↓
System stores marks
        ↓
System calculates progress
        ↓
Student sees progress
        ↓
Parent sees child's progress
```

The student does not need to submit homework to the platform.

Example:

```text
Teacher:
"Did Ali complete today's homework?"

Yes → mark completed / give score

No → mark incomplete / give score
```

The student simply sees:

```text
Today's Homework
✓ Completed

Score: 85/100
```

---

# 3. Main Users

## 3.1 Admin

Initially the admin may also be the teacher.

Admin can:

- Manage students
- Manage parents
- Manage teachers
- Manage groups
- Manage courses
- Manage levels
- Manage schedules
- Manage lessons
- Manage attendance
- Enter academic results
- Create quizzes
- View quiz results
- Manage payments/status
- View student progress
- View group statistics
- Manage active/inactive students
- Manage points
- Manage rewards
- Configure system settings

---

# 3.2 Teacher

Teacher is the primary operator of the system.

Teacher should be able to perform most daily operations from one simple workflow.

The teacher should be able to:

```text
Open Group
   ↓
Open Today's Lesson
   ↓
See Students
   ↓
Mark Attendance
   ↓
Record Homework
   ↓
Record Participation / Task
   ↓
Record Skill Assessment if applicable
   ↓
Save
```

The system then automatically calculates progress.

---

# 3.3 Student

Students primarily use Telegram.

Students can:

- View profile
- View current group
- View teacher
- View schedule
- View today's lesson
- View current lesson topic
- View homework
- View tasks
- View materials
- View marks
- View weekly results
- View monthly results
- View attendance
- View progress
- View group points
- Complete available quizzes
- View quiz results
- View achievements / rewards

Students cannot:

- Edit their own marks
- Edit attendance
- Upload homework
- Change profile information
- Change group
- Change payment status

---

# 3.4 Parent

Parents use the same Telegram bot system.

A parent can connect to one or multiple children.

Parent can view:

- Child profile
- Current group
- Schedule
- Attendance
- Homework
- Tasks
- Results
- Monthly assessment
- Overall progress
- Points
- Group position/statistics
- Payment status
- Debt
- Payment history/status
- Important notifications

Parent cannot modify academic records.

---

# 4. Student and Parent Telegram Bot

A separate student bot and parent bot are not required initially.

Use **one Telegram bot** with role-based behavior.

The system determines whether the Telegram account is:

```text
Student
Parent
Teacher/Admin
```

A parent with multiple children can select:

```text
My Children

> Ali
> Madina
> Abdulloh
```

After selecting a child, the parent sees the same relevant academic information that the child can see, plus parent-specific information such as payment status.

---

# 5. Telegram Bot UX Principle

The bot must be understandable to:

- Children
- Teenagers
- Adults
- Parents

Avoid technical terminology.

Do not use complicated menu structures.

Recommended main menu:

```text
📚 My Studies
📊 My Progress
📝 Homework
🧠 Quizzes
📅 Schedule
✅ Attendance
🏆 Points & Achievements
👤 My Profile
💳 Payment
```

For parents:

```text
👨‍👩‍👧 My Children
📊 Progress
📅 Attendance
📝 Homework
🧠 Quizzes
🏆 Points
💳 Payment
🔔 Notifications
```

The exact labels can be adjusted later.

---

# 6. Academic Structure

The platform should not hardcode English-specific logic into the entire system.

The initial structure is:

```text
Subject
   ↓
Course
   ↓
Level
   ↓
Group
   ↓
Students
```

Example:

```text
Subject: English

Course: General English

Level: Elementary

Group: EG-01

Students:
- Ali
- Madina
- Aziz
...
```

Later:

```text
Subject: Mathematics

Course: General Mathematics

Level: Grade 7

Group: MATH-01
```

The same core system should continue working.

---

# 7. Students

Each student should have:

## Personal information

- ID
- First name
- Last name
- Date of birth
- Age (calculated from date of birth)
- Phone number
- Telegram account
- Parent relationship

## Education information

- School/class/grade
- Subject
- Course
- Level
- Group
- Enrollment date
- Student status

## Student status

At minimum:

```text
Active
Inactive
Paused
Completed
Left
```

The system must clearly distinguish active and inactive students.

Inactive students should not normally appear in daily teacher attendance/lesson lists.

Historical data must remain available.

---

# 8. Parent Relationship

A parent can have multiple children.

```text
Parent
 ├── Student A
 ├── Student B
 └── Student C
```

The parent should be able to switch between children.

Example:

```text
👨‍👩‍👧 My Children

Ali
Group: Intermediate 02
Progress: 82%

Madina
Group: Elementary 01
Progress: 91%
```

---

# 9. Groups

Groups are a major part of the system.

A group contains:

- Group name
- Subject
- Course
- Level
- Teacher
- Students
- Schedule
- Start date
- Status

Example:

```text
Intermediate 01

Teacher: Umid
Days: Monday / Wednesday / Friday
Time: 18:00
Students: 18
Status: Active
```

Students belong to groups through enrollment.

The system should preserve historical group membership.

If a student changes groups, previous group results must remain available.

---

# 10. Group Performance

Students can see performance within **their own group only**.

They must NOT see the entire center's student ranking.

Example:

```text
🏆 This Month — Intermediate 01

1. Student A — 920 points
2. Student B — 890 points
3. You — 850 points
4. Student D — 820 points
```

The exact privacy rules should be configurable.

Possible visible information:

- Points
- Percentage
- Position
- Achievement
- Monthly score

The system should never expose students from other groups.

---

# 11. Points System

The center can use a points system to motivate students.

Points can come from:

- Homework completion
- Classroom participation
- Tasks
- Vocabulary
- Quiz results
- Weekly assessments
- Monthly assessments
- Attendance
- Other teacher-defined activities

Example:

```text
Homework completed: +10
Quiz completed: +10
Quiz score: +5 bonus
Excellent participation: +10
Monthly assessment: +50
```

The exact point rules should be configurable rather than hardcoded.

---

# 12. Points vs Academic Scores

These must be separate concepts.

### Academic score

Measures learning performance.

Example:

```text
Grammar: 85/100
Speaking: 90/100
Monthly test: 82/100
```

### Points

Used for motivation / ranking / rewards.

Example:

```text
Homework: +10
Quiz: +15
Participation: +10

Total: 35 points
```

Do NOT automatically treat:

```text
85 academic score = 85 points
```

unless the center explicitly chooses that rule.

The system should support both.

---

# 13. Rewards

The center may give gifts/rewards based on points.

Possible reward criteria:

### Monthly

```text
Highest points this month
```

### Course duration

```text
Highest accumulated points during the course
```

### Achievement

```text
Perfect attendance
Most improved
Best monthly result
Quiz champion
```

Rewards should be recorded as achievements/reward records.

Example:

```text
🏆 Monthly Champion

Student: Ali
Month: September 2026
Points: 920
Reward: Gift
```

The reward itself can simply be recorded in the system initially. No complex inventory system is required.

---

# 14. Lessons

A lesson represents an actual classroom session.

Example:

```text
Group: Intermediate 02
Date: 17 Sep 2026
Time: 18:00
Teacher: Umid
Topic: Present Perfect
```

The teacher can record:

- Topic
- Current subject/theme
- Materials
- Homework
- Tasks
- Vocabulary
- Attendance
- Marks
- Notes

---

# 15. Lesson Materials

Teacher can attach materials to lessons.

Supported types should include:

- PDF
- Word document
- Image
- Video
- Audio
- Link
- Text

Students can view/download/open the material through Telegram.

The system does not need a complicated document management system for V1.

---

# 16. Homework

Homework is teacher-provided information.

The student does NOT upload the homework.

Example:

```text
📚 Today's Homework

Unit 5
Exercise 3–6

Learn:
20 new vocabulary words

Due:
Next lesson
```

Teacher later checks the student's homework physically in class and records:

```text
Ali — Completed — 90
Madina — Completed — 80
Aziz — Not completed — 0
```

The student and parent then see the result.

---

# 17. Tasks / Classroom Participation

The teacher may give students tasks during class.

Example:

```text
Speaking task
Vocabulary task
Grammar task
Pair work
Presentation
Writing task
```

The teacher records the result.

The platform does not need to know exactly how the task was performed.

It only stores:

```text
Student
Task
Date
Score / status
Teacher comment (optional)
```

---

# 18. Different Levels Need Different Assessment Structures

This is important.

Do NOT force every student to have:

- Grammar
- Reading
- Listening
- Speaking
- Writing

at all levels.

For example:

### Beginner

Could use:

```text
Grammar
Vocabulary
Speaking
Homework
Participation
```

### Intermediate

Could use:

```text
Grammar
Vocabulary
Reading
Listening
Speaking
Writing
```

### Advanced

Could use:

```text
General performance
Speaking
Writing
Reading
Listening
Grammar
```

Or the teacher may simply give:

```text
General weekly assessment: 85/100
```

Therefore assessment categories must be **configurable per course/level/group**.

Do not hardcode the five skills into the database.

---

# 19. Assessment System

The assessment system is the central academic measurement engine.

An assessment can be:

- Weekly
- Monthly
- General
- Grammar
- Reading
- Listening
- Speaking
- Writing
- Vocabulary
- Classroom task
- Homework
- Custom

An assessment has:

```text
Title
Type
Date
Group
Skill/category
Maximum score
Results
Teacher comment
```

Example:

```text
Assessment:
Weekly Assessment — Week 3

Group:
Intermediate 02

Category:
Speaking

Maximum:
100
```

Teacher enters:

```text
Ali: 85
Madina: 92
Aziz: 76
```

The platform stores the results.

---

# 20. Weekly Results

Weekly results are generated from the assessments entered during the week.

Example:

```text
📊 Weekly Result

Grammar       85
Reading       80
Listening     88
Speaking      90
Writing       82

Overall       85
```

For a level without reading/listening:

```text
Grammar       87
Vocabulary    90
Speaking      84

Overall       87
```

The system calculates only categories that are actually configured for that group/level.

---

# 21. Monthly Assessment

Monthly assessments happen physically in the classroom.

The platform is NOT responsible for conducting the physical exam.

Teacher simply records the results afterward.

Example:

```text
September Monthly Assessment

Grammar       82
Reading       78
Listening     85
Speaking      90
Writing       80

Overall       83
```

Student and parent can then see the result in Telegram.

---

# 22. Quizzes

Quizzes are different from normal teacher-entered assessments.

Students can actually interact with quizzes through Telegram.

Example:

```text
🧠 Daily Quiz

Question 1/10

Choose the correct answer:

She ___ to school every day.

A) go
B) goes
C) going
D) gone
```

Student selects:

```text
B
```

The platform automatically records the answer.

After completion:

```text
🎉 Quiz completed!

Score: 8/10
Percentage: 80%
Points earned: +15
```

The result becomes part of the student's academic history.

---

# 23. Quiz Frequency

Quizzes can be:

- Daily
- Weekly
- Optional
- Group-specific
- Level-specific

Example:

```text
Daily Vocabulary Quiz
Weekly Grammar Quiz
Monthly Revision Quiz
```

Teacher can decide which groups receive which quizzes.

---

# 24. Progress Calculation

The system should calculate progress automatically based on a selected timeframe.

Possible timeframes:

- Today
- This week
- This month
- Current course
- Since enrollment

Example:

```text
Student Progress

Current:
84%

Previous month:
78%

Change:
+6%
```

Progress should be calculated from stored academic results.

The teacher should not manually calculate averages.

---

# 25. Progress Components

A student's progress may include:

```text
Academic average
Quiz average
Homework performance
Attendance
Points
Monthly assessment
Weekly assessments
```

However, these should remain separate.

Example:

```text
📊 Academic Progress
84%

📝 Homework
91%

🧠 Quiz Average
87%

✅ Attendance
96%

🏆 Points
840
```

Do not combine all of these into one meaningless number.

If the center wants a single overall score, define a transparent formula.

---

# 26. Attendance

Attendance is recorded by the teacher.

Possible statuses:

```text
Present
Absent
Late
Excused
```

Teacher opens today's group:

```text
Intermediate 02

☑ Ali
☑ Madina
☐ Aziz
☑ Sardor
```

The system records the attendance.

Student sees:

```text
Attendance

September:
Present: 12
Absent: 1
Late: 1

Attendance: 92.8%
```

Parent sees the same information for their child.

---

# 27. Payment Tracking

The platform does NOT process payments.

Payments happen manually.

The teacher/admin simply records the payment status.

Example:

```text
September payment

Status: Paid
Amount: 500,000
Date: 03 Sep
Recorded by: Teacher
```

Or:

```text
September payment

Status: Debt
Amount due: 500,000
Paid: 200,000
Remaining: 300,000
```

The student/parent can see:

```text
💳 September

Paid: 500,000
Status: Paid
```

or:

```text
⚠ September payment

Total: 500,000
Paid: 200,000
Remaining: 300,000
Status: Debt
```

No online payment gateway is required in V1.

---

# 28. Active / Inactive Students

Student status is important.

Example:

```text
Active
Inactive
Paused
Left
Completed
```

If a student leaves:

- Do not delete the student.
- Set status to inactive/left.
- Preserve all historical data.

Historical information includes:

- Attendance
- Marks
- Assessments
- Payments
- Group history
- Quiz results
- Points

---

# 29. Teacher Daily Workflow

The system should optimize this workflow.

## Step 1

Teacher opens dashboard.

```text
Today's lessons

18:00 — Elementary 01
19:30 — Intermediate 02
```

## Step 2

Teacher opens group.

```text
Intermediate 02
18 students
```

## Step 3

Teacher records attendance.

## Step 4

Teacher records today's lesson topic.

```text
Present Perfect
```

## Step 5

Teacher enters homework.

```text
Workbook Unit 5
Exercise 4–7
```

## Step 6

Teacher records homework/task marks.

## Step 7

Teacher records skill/general marks when appropriate.

## Step 8

Save.

The system automatically:

- Updates averages
- Updates points
- Updates progress
- Updates attendance
- Updates group statistics
- Makes information available to Telegram
- Generates notifications if configured

The teacher should NOT need to manually update five different modules for one lesson.

---

# 30. Teacher Interface Principle

The teacher should work primarily from:

```text
Dashboard
   ↓
Today's Schedule
   ↓
Group
   ↓
Today's Lesson
```

The teacher should not have to navigate:

```text
Students → Assessments → Results → Group → Homework → Attendance
```

for every lesson.

The UI should be designed around **daily teaching workflow**, not database structure.

---

# 31. Student Profile in Telegram

Example:

```text
👤 My Profile

Name:
Ali Kholturaev

Group:
Intermediate 02

Level:
Intermediate

Teacher:
Umid

Started:
September 2026

Status:
Active

📊 Overall Progress
84%

🏆 Points
850
```

---

# 32. Student Progress Screen

```text
📊 My Progress

Academic Average
84%

Weekly Average
86%

Monthly Assessment
82%

Homework
91%

Quiz Average
88%

Attendance
96%

🏆 Points
850
```

The exact metrics displayed depend on the level/group configuration.

---

# 33. Current Lesson / Theme

Student should easily see what is currently being studied.

Example:

```text
📚 Current Topic

Present Perfect

Today's lesson:
Unit 5

Homework:
Exercise 3–6

Vocabulary:
20 words

Next lesson:
Friday, 18:00
```

Parent can see this as well.

---

# 34. Parent Dashboard

Parent should not be presented with a complicated academic system.

Example:

```text
👨‍👩‍👧 Ali's Progress

Group:
Intermediate 02

📊 Progress
84%

✅ Attendance
96%

📝 Homework
91%

🧠 Quiz
88%

🏆 Points
850

💳 Payment
Paid
```

The parent should immediately understand how their child is doing.

---

# 35. Notifications

Notifications should be lightweight and useful.

Possible notifications:

### Student

```text
📚 New homework has been added.
```

```text
📊 Your weekly result is available.
```

```text
🧠 New quiz is available.
```

```text
🏆 You earned 20 points.
```

### Parent

```text
📊 Ali's weekly result is available.
```

```text
⚠ Ali was absent today.
```

```text
💳 September payment has not been completed.
```

Do not send excessive notifications.

---

# 36. Group Statistics

Teacher can see:

```text
Intermediate 02

Students: 18

Average:
84%

Attendance:
94%

Homework:
89%

Quiz:
86%

Points:
Total: 14,520
Average: 806
```

Teacher can also inspect individual students.

---

# 37. Data Privacy

Students should only access their own academic records.

Parents should only access their linked children.

Students must not access:

- Other groups
- Other students' private data
- Center-wide ranking
- Teacher administration
- Payment data of other students

Group leaderboard, if enabled, should only contain students from the same group.

---

# 38. Backend Architecture

The system does not need microservices.

For 100–150 students, use a simple architecture:

```text
Telegram Bot
      |
      v
Backend API
      |
      v
PostgreSQL / Database
      |
      v
Admin Web Panel
```

A single backend application is sufficient.

Recommended conceptual structure:

```text
Backend
├── Authentication
├── Users
├── Students
├── Parents
├── Teachers
├── Subjects
├── Courses
├── Levels
├── Groups
├── Enrollments
├── Lessons
├── Materials
├── Homework
├── Attendance
├── Assessments
├── Assessment Results
├── Quizzes
├── Quiz Results
├── Points
├── Rewards
├── Payments
├── Progress
├── Notifications
└── Reports
```

Do not create separate services for these modules at the current scale.

---

# 39. Database Principle

The database should be the single source of truth.

Do not store the same information repeatedly.

For example, do not store:

```text
student.overall_average
weekly_report.average
monthly_report.average
group_student.average
```

as manually maintained values.

Instead:

```text
Assessment Results
        ↓
Calculation
        ↓
Progress / Report
```

Cached/calculated values can be introduced later if performance requires them.

For 100–150 students, normal database queries should be more than sufficient.

---

# 40. Recommended Core Entities

At minimum:

```text
User
Student
Parent
Teacher

Subject
Course
Level
Group
Enrollment

Lesson
LessonMaterial

Homework
HomeworkResult

Attendance

Assessment
AssessmentCategory
AssessmentResult

Quiz
QuizQuestion
QuizOption
QuizAttempt
QuizAnswer

PointTransaction
Reward

Payment

Notification
```

Reports and progress should primarily be calculated from these records rather than becoming independent sources of truth.

---

# 41. Important Historical Data Rules

Never delete academic history simply because a student becomes inactive.

Example:

```text
Student:
Ali

2026:
Elementary 01
   ↓
Intermediate 02
```

The system should preserve:

```text
Elementary 01
Enrollment: Jan–Jun

Intermediate 02
Enrollment: Jul–Dec
```

This allows historical reporting.

---

# 42. Future Subject Support

English is the first subject.

The architecture must support:

```text
English
Mathematics
Physics
Chemistry
IELTS
Other subjects
```

However, do not over-engineer V1.

The system should have configurable:

- Subject
- Course
- Level
- Assessment categories
- Grading rules

Example:

```text
English / Intermediate

Categories:
Grammar
Reading
Listening
Speaking
Writing
Vocabulary
```

Mathematics could later use:

```text
Mathematics / Grade 7

Categories:
Algebra
Geometry
Problem Solving
```

No major backend rewrite should be necessary.

---

# 43. Important Business Rule: Assessment Categories Are Configurable

Do not assume every group uses the same categories.

For example:

```text
Group A

Grammar
Vocabulary
Speaking
```

while:

```text
Group B

Grammar
Reading
Listening
Speaking
Writing
```

and:

```text
Group C

General English Performance
```

The progress calculation must use the categories configured for that group's course/level.

---

# 44. Important Business Rule: Time Frames

The platform should support:

```text
Daily
Weekly
Monthly
Course duration
Custom date range
```

Example:

```text
Weekly progress:
17 Sep – 23 Sep

Monthly progress:
September

Course progress:
01 Sep – 30 Nov
```

The system should calculate results according to the selected timeframe.

---

# 45. Reports

The initial reports should be simple.

## Student report

```text
Student
Group
Attendance
Homework
Quiz
Assessments
Average
Points
Progress
```

## Group report

```text
Students
Average
Attendance
Homework
Quiz
Points
Individual performance
```

## Monthly report

```text
Student
Monthly average
Assessment
Attendance
Homework
Quiz
Points
```

---

# 46. What the System Should NOT Do in V1

Do not implement unnecessary complexity.

The system does NOT need:

- Online homework submission
- File submission from students
- Complex LMS functionality
- Live online classes
- Video conferencing
- Online payment gateway
- Payroll
- Accounting system
- Complex CRM
- Microservices
- AI grading
- Complicated gamification engine
- Large-scale analytics infrastructure

The center is initially only around 100–150 students.

Keep the system fast and maintainable.

---

# 47. V1 Priorities

The first implementation should prioritize:

### Highest priority

1. Authentication / roles
2. Students
3. Parents
4. Teachers
5. Groups
6. Enrollment
7. Schedule
8. Lessons
9. Attendance
10. Homework
11. Assessment results
12. Progress calculation
13. Telegram bot
14. Parent-child relationship

### Next

15. Quizzes
16. Points
17. Group leaderboard
18. Monthly assessments
19. Payments/debt status
20. Notifications
21. Rewards

### Later

22. Multiple teachers
23. Multiple branches
24. Multiple subjects
25. Advanced analytics
26. Certificates
27. Advanced quiz engine
28. More sophisticated reward system

---

# 48. Definition of Success

The system is successful if a teacher can run a normal teaching day without significant administrative overhead.

Example:

```text
Teacher arrives
      ↓
Opens today's group
      ↓
Marks attendance
      ↓
Teaches lesson
      ↓
Records topic
      ↓
Records homework
      ↓
Records student marks
      ↓
Saves
```

Everything else should happen automatically:

```text
                    ┌→ Student Bot
Teacher → Backend ──┼→ Parent Bot
                    ├→ Progress
                    ├→ Group Statistics
                    ├→ Points
                    └→ Reports
```

---

# 49. Final Product Concept

The product should be thought of as:

> **Teacher-controlled academic management + automated progress calculation + Telegram-based student/parent visibility.**

Not:

> An online learning platform where students submit everything online.

The teacher remains the central source of academic information.

The platform's job is to:

1. Store teacher-entered information.
2. Calculate results.
3. Track progress over time.
4. Track attendance.
5. Track points.
6. Track quiz performance.
7. Track payment status.
8. Present understandable information to students.
9. Present understandable information to parents.
10. Provide useful management tools to teachers/admins.

---

# 50. Golden Architecture Rule

The entire implementation should follow this rule:

```text
ONE SOURCE OF TRUTH

Teacher enters data
        ↓
Database stores data
        ↓
Business logic calculates
        ↓
Reports / progress are generated
        ↓
Telegram displays information
```

Do not duplicate business logic between:

- Admin panel
- Student bot
- Parent bot

The backend owns the business rules.

The web panel and Telegram bot are simply different interfaces to the same system.

This will make it possible to add a mobile app, another Telegram interface, or another subject later without rebuilding the core system.

---

# 51. V1 Decisions (Confirmed 2026-09-17)

The requirements above left a number of business rules ambiguous, contradictory, or unspecified. The following decisions were made explicitly to resolve them and take precedence over any conflicting statement or example elsewhere in this document. They are binding for V1 implementation.

## 51.1 Time & Scoring

- **Reporting periods** (relates to §20, §24, §44): "Week" = calendar week, Monday–Sunday. "Month" = calendar month. No per-group schedule-anchored weeks in V1.
- **Assessment scoring scale** (relates to §19): Each assessment keeps a configurable `Maximum score` field. All averages, category averages, and weekly/monthly aggregates first normalize every result to a percentage before combining. Raw scores of differing scales are never averaged directly.
- **No blended "overall score"** (relates to §25, §31, §32): V1 does **not** compute a single combined progress number. Student/parent screens show the separate metrics only (academic average, homework %, quiz average, attendance %, points). The "Overall Progress: 84%" style figure shown in some mockups does not ship in V1.
- **Homework scoring** (relates to §16): A homework entry always has a completion status (Completed / Not completed). A numeric score is optional. Homework performance % is computed only from entries that have a score; ungraded completions are excluded from that average (not counted as 0 or 100).
- **Attendance percentage** (relates to §26): `Present` and `Late` both count as full attendance credit. `Absent` counts as 0. `Excused` is removed from the denominator entirely (neither helps nor hurts the percentage).

## 51.2 Structure & Lifecycle

- **Assessment category changes** (relates to §18, §43): Category sets are versioned/snapshotted per level/group. Changing categories (e.g., adding "Writing") only affects reports generated after the change. Historical reports keep using the category set that was active when they were produced; they are never retroactively recomputed or blanked.
- **Enrollment cardinality** (relates to §7, §9): A student may hold at most one active enrollment per subject at a time. Concurrent active enrollments across *different* subjects are allowed (e.g., active in English and Mathematics simultaneously once multi-subject support exists) but never two simultaneous active enrollments in the same subject.
- **Quiz assignment model** (relates to §22, §23): A quiz is authored once and can be assigned to any number of groups/levels. Each group's attempts, scoring, and leaderboard contribution are tracked independently per assignment.
- **Quiz retake policy** (relates to §22, §23): Quizzes are one-attempt-only per student. There is no retake in V1.
- **"Paused" vs. "Inactive"** (relates to §7, §28): These are functionally distinct, not synonyms. `Paused` = temporary, student is expected to return; their group seat is held, and no new payment debt or attendance/homework expectation accrues while paused. `Inactive` is the generic "not currently active" catch-all with no such guarantees. `Left` and `Completed` remain terminal statuses.
- **Teacher-per-group cardinality** (relates to §1, §47): V1 models exactly one teacher per group (a single foreign key, not many-to-many). Co-teacher/substitute-teacher support is explicitly deferred to the "Later" phase per §47 and is not modeled in the V1 schema.
- **Group change mid-period** (relates to §9, §41): When a student changes groups partway through a week or month, their report for that period is split per-enrollment: they receive a partial report from each group covering only the days they were actually enrolled there. Reports are never attributed entirely to the group at the start or end of the period.

## 51.3 Points & Rewards

- **Point value assignment** (relates to §11): Admin configures default point values per activity type (homework, participation, quiz, etc.). The teacher may override the point value for a specific instance at the time of recording it; there is no hard-locked, non-overridable rule table.
- **Points never reset** (relates to §10, §13, §39): Every point award is a permanent, timestamped ledger entry (`PointTransaction`). There is no periodic reset. "This month's" or "this course's" point totals are calculated by summing ledger entries within the relevant date range — never stored as a separately maintained running total, consistent with §39's single-source-of-truth principle.
- **Points are tagged to the group/enrollment active when earned** (relates to §9, §10, §41): Each point transaction records which group/enrollment the student was in at the time it was earned. A group's leaderboard and statistics only sum transactions tagged to that specific group — a student transferring in from another group does not carry their prior group's points into the new group's ranking. The student's own profile ("My Points") sums transactions across all groups/enrollments for a personal lifetime total.
- **Leaderboard default state** (relates to §10, §37): Group leaderboards are **off by default**; an admin/teacher opts a specific group in. When enabled, ranking is by points, and the default (and only, in V1) timeframe shown is "this calendar month," computed from that group's tagged point transactions dated within the current month.
- **Rewards do not consume points** (relates to §13): Winning a reward (monthly, course-duration, or achievement-based) is purely a recorded achievement and never deducts or resets the qualifying points, consistent with §13's "no complex inventory system" instruction.

## 51.4 Payments

- **Billing model** (relates to §27): Monthly subscription billing only. One `Payment` record per student per calendar month. No per-lesson/package billing in V1.
- **Payment recording ownership** (relates to §3.1, §27 — resolves a direct contradiction between the two): Both Admin and Teacher may record and edit payment status. The system logs who recorded each entry via a `Recorded by` field, reflecting that in a small center the teacher often collects payment in person.
- **Debt across months**: Each month's `Payment` record is tracked independently (no automatic carry-forward of one month's unpaid balance into the next month's `amount_due`). The system additionally computes and displays a running "total outstanding across all months" figure per student, so multi-month debt is never hidden from the admin.
- **Debt notification trigger** (relates to §35): A configurable due-day of the month (admin-set) determines when the system flags/notifies for any student who does not have a "Paid" status for the current month. There is no per-student due-date variation and no purely manual trigger requirement — the fixed due-day drives it automatically.

## 51.5 Access & Data Ownership

- **Parent access after a child becomes inactive** (relates to §28, §37): A parent retains full read access to a child's historical data after the child's status becomes Inactive, Paused, Left, or Completed. Access is only removed by an explicit admin action to unlink the parent-child relationship — it is never revoked automatically as a side effect of a status change.
- **Telegram identity linking** (relates to §4): A Telegram account is verified and linked to a specific student or parent record via a one-time linking code issued by the admin when the record is created. There is no phone-number-matching or purely manual admin-lookup linking flow in V1.
- **Parent-child cardinality** (relates to §8): Parent-Student is many-to-many. Multiple guardians (e.g., mother and father) may each hold their own linked Telegram account for the same child, and one guardian account may link to multiple children.
- **Record corrections** (new — not previously addressed): Edits to marks, attendance, homework, or payment records overwrite the previous value directly. There is no audit trail and no automatic re-notification to students/parents when a previously-viewed value is changed. This may be revisited if corrections prove frequent enough to cause confusion in practice.

## 51.6 Multi-Subject / Multi-Enrollment Students

- **Combined vs. per-subject totals** (relates to §31, §32 — depends on §51.2's enrollment cardinality decision): A student's "My Points" figure is a single combined lifetime total across all of their enrollments/subjects (points are just a running tally, so combining them is harmless). Academic progress percentages are **never** combined across subjects — each subject/group enrollment shows its own separate progress figures, consistent with §25's rule against collapsing unrelated metrics into one meaningless number.

# End of Requirements