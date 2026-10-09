# Homework photos are stored on Telegram, not by us

Some groups (CEFR Advanced, for a start) hand homework in as photos of their notebooks, through the bot or the Mini App. That is roughly 30 students × 3 photos × 12 lessons ≈ 1,000 photos, or about 300 MB, a month — and the server runs on Railway's Hobby plan, where a volume is small, tied to one service, and Postgres is no place for images.

So we don't store the bytes at all. Every photo is sent to Telegram (it is already there when a student sends it to the bot), and we keep only its `file_id` — about 100 bytes a row. When a teacher or the student opens one, the server asks the Bot API for the file and streams it on, with a small in-memory cache and a long `Cache-Control`. Telegram keeps files for as long as a message holds them, so with `TELEGRAM_STORAGE_CHAT_ID` set every photo is also posted in a private channel the bot runs: that copy survives a family deleting their chat, and doubles as a place to look through submissions by hand. Without it, Mini App uploads are posted in the uploader's own chat.

The Mini App shrinks a photo to 1600px JPEG (a few hundred KB) before uploading, one photo per request, so uploads stay quick on mobile data and a dropped connection loses one photo, not the batch.

Voice notes (speaking homework, added October 2026) are kept the same way: a student records one in the bot chat, the bot posts a copy in the storage channel with `sendVoice` (`sendAudio` for an audio file), and we keep its `file_id` and length in `homework_voices`. A voice note is roughly 100–200 KB a minute. They are not recorded in the Mini App — browsers record in different formats, and Telegram's own mic button is what students already know. Audio files over 20 MB are refused, since the Bot API couldn't download them back. Telegram records Ogg/Opus, which some older Safari versions can't play; the player offers a download there instead.

Videos (October 2026) follow the same path: a round video message (`sendVideoNote`, whose caption goes in a reply since it can't carry one) or a regular video (`sendVideo`), with its `file_id`, length and size in `homework_videos`. Anything over 20 MB is refused for the same reason as audio — a round message is at most a minute and a few MB, a phone video about 2–3 minutes. Videos skip the server's in-memory cache (two would fill it) and are played from an object URL in the browser, so no byte-range support is needed.

Trade-offs accepted: photos depend on Telegram (if the bot token is lost or revoked, the file ids stop working — the storage channel still has every photo, just not linked to rows); Telegram recompresses photos to at most 2560px; the Bot API only downloads files up to 20 MB, far above a homework photo. Moving to object storage (e.g. Cloudflare R2) later only means a different `HomeworkFileStore` (apps/server/src/telegram/fileStore.ts) and a one-off copy of the existing files.

Status: accepted
