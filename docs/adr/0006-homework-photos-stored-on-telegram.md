# Homework photos are stored on Telegram, not by us

Some groups (CEFR Advanced, for a start) hand homework in as photos of their notebooks, through the bot or the Mini App. That is roughly 30 students × 3 photos × 12 lessons ≈ 1,000 photos, or about 300 MB, a month — and the server runs on Railway's Hobby plan, where a volume is small, tied to one service, and Postgres is no place for images.

So we don't store the bytes at all. Every photo is sent to Telegram (it is already there when a student sends it to the bot), and we keep only its `file_id` — about 100 bytes a row. When a teacher or the student opens one, the server asks the Bot API for the file and streams it on, with a small in-memory cache and a long `Cache-Control`. Telegram keeps files for as long as a message holds them, so with `TELEGRAM_STORAGE_CHAT_ID` set every photo is also posted in a private channel the bot runs: that copy survives a family deleting their chat, and doubles as a place to look through submissions by hand. Without it, Mini App uploads are posted in the uploader's own chat.

The Mini App shrinks a photo to 1600px JPEG (a few hundred KB) before uploading, one photo per request, so uploads stay quick on mobile data and a dropped connection loses one photo, not the batch.

Trade-offs accepted: photos depend on Telegram (if the bot token is lost or revoked, the file ids stop working — the storage channel still has every photo, just not linked to rows); Telegram recompresses photos to at most 2560px; the Bot API only downloads files up to 20 MB, far above a homework photo. Moving to object storage (e.g. Cloudflare R2) later only means a different `HomeworkFileStore` (apps/server/src/telegram/fileStore.ts) and a one-off copy of the existing files.

Status: accepted
