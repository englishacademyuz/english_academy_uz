# Students use a Telegram Mini App; the bot only links accounts and notifies

The student bot used to be a text interface: a reply keyboard (📚 📊 📝 ✅ 👤) whose buttons each produced a formatted chat message, and quizzes were taken one inline-keyboard message at a time. That scales badly — lesson materials, calendars, and a month of marks don't fit in chat messages — and parents found it hard to read. So the student-facing interface is now one Telegram Mini App, served by admin-web under `/student/*`, and the bot is reduced to account linking (sending the student code) and notifications (e.g. "new quiz" with a button that opens it in the Mini App). Quizzes are taken inside the Mini App too.

Identity comes from Telegram's signed `initData`, verified server-side with the bot token (HMAC-SHA-256, max 24h old) on every request; the Telegram user id is mapped to a Student through TelegramLink, and no route accepts a student id. Because only inline `web_app` buttons and the chat menu button pass signed `initData` (reply-keyboard `web_app` buttons are for `sendData` only), the old reply keyboard is removed rather than converted.

Trade-offs accepted: the Mini App needs a public HTTPS URL, so it can't be exercised in Telegram against a plain localhost dev server; and it ships inside the admin-web deploy (lazy-loaded chunk, own root without admin auth) instead of a separate service, so the two share one build and release.

Status: accepted
