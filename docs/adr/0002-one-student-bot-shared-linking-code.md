# One student bot, shared by parents through the student's linking code

The original model gave parents their own identity: a Parent record, a many-to-many ParentStudentLink, a parent-specific LinkingCode and a separate parent menu in the bot with a "choose your child" step. In practice the center wants one bot that shows a student's data, with parents simply looking at the same screens. So Parent, ParentStudentLink and the PARENT role are removed.

Instead, a LinkingCode always belongs to one Student and is reusable until it expires (24h). The student and each parent redeem the same code from their own Telegram accounts, and each redemption creates a TelegramLink row (chat id → Student). A student can have any number of linked chats; a chat views exactly one Student at a time, and sending another student's code re-points it. A parent with two children at the center switches between them that way, which is the one thing this design makes clumsier than the old child picker.

Trade-off accepted: anyone who holds an unexpired code gains read access to that student, and there is no longer a record of *who* (student vs. which parent) a linked chat belongs to. The admin sees only how many chats are linked.

This supersedes the Parent, ParentStudentLink and one-time LinkingCode parts of `docs/DOMAIN-MODEL.md` and `docs/ARCHITECTURE.md`.

Status: accepted
