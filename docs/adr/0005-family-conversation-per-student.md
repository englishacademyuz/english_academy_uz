# One family Conversation per student, relayed through the bot

Parents need to reach the teacher — "he's ill today", "what was the homework?", a payment question — and the teacher needs to answer without handing out a personal number. ADR-0004 reduced the bot to linking and notifications; it now also carries this chat.

There is one Conversation per Student, not per Telegram chat. The bot still doesn't know which linked chat is a parent and which is the student (ADR-0002), so every linked chat shares the thread: any of them can write, and a staff answer goes to all of them. Each family message keeps the chat id and Telegram name it came from, so staff can tell "Dilnoza" from "Bekzod", and the Mini App can mark a chat's own messages. Any text a linked chat sends to the bot that isn't a linking code or an old menu label becomes a message; the Mini App has the same thread on its own screen.

Only the Teacher of one of the student's current Groups, or an Admin, may read or answer it. Unread state is per staff member (`ConversationRead`), so an admin opening a thread doesn't clear it for the teacher. The panel polls for new messages (every 15s for the badge, faster while the chat is open) instead of using websockets — enough for a center of this size, with nothing extra to deploy.

Trade-offs accepted: the student sees what their parents and the teacher write to each other; a stray message typed into the bot reaches the teacher (the bot confirms each new run of messages, so it's never silent); only text is relayed for now.

Status: accepted
