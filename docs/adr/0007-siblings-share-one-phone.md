# Siblings who share one phone are tied into a Family

ADR-0002 made a chat view one Student at a time: a parent with two children at the center switched between them by sending the other child's code. That works badly when siblings share one phone. The admin has to issue a fresh code every time, and notifications for the child the chat isn't pointed at never arrive.

An admin now ties siblings into a **Family** (`Student.familyId`, from the students list). Nothing about linking changes: a chat still redeems one Student's code and still has one TelegramLink. But a chat linked to any member of a Family may open every member.

- **Mini App:** on a family phone, the first screen every time the app opens is "whose account?". Every bot button leads there first. The screen it was meant for follows the choice. The choice lives only in memory, so closing and reopening the app asks again. Requests then name the chosen Student in `x-student-id`, and the server honors it only for a member of the chat's Family.
- **Bot:** the TelegramLink's Student is the one the chat chose last, either in the Mini App or with the name buttons under the bot menu. Homework files and messages to the teacher sent to the bot go to that Student. If only one sibling's group takes homework through the bot, files go to that sibling anyway. Replies on a family phone name the Student.
- **Notifications:** a Student's news (payments, absences, homework reviews, teacher answers) goes to the chats of the whole Family, and already names the Student. Group-wide news (a new quiz, a moved lesson) goes to each chat once and lists which of its children it concerns.

When a member is deleted, chats pointed at them move to a sibling. A Family left with one Student is dissolved. A Family holds at most 5 Students.

Trade-off accepted: tying is an admin judgment. Every phone of one sibling sees all the others, including a phone linked only through one child's code.

Status: accepted
