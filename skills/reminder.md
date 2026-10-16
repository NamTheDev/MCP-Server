# Reminder Skill

Five tools for scheduled reminders. Load this once before first use.

## Tools

- `add_reminder(text, when, email)` — `email` is REQUIRED
- `list_reminders(include_past?, limit?)` — soonest first; default 20, max 50
- `update_reminder(id, email, text?, when?)` — `email` is REQUIRED; text/when optional
- `delete_reminder(id)`
- `get_current_time()`

Every reminder carries an email address. When the reminder is due, the server
emails its text to that address. There is no global default — each reminder
has its own.

## Examples

User: "Remind me to call mom tomorrow, email me at alice@example.com."
→ add_reminder(text="call mom", when="tomorrow", email="alice@example.com")

User: "In 30 minutes, remind me to check the oven — alice@example.com."
→ add_reminder(text="check the oven", when="30 minutes", email="alice@example.com")

User: "Remind me on Nov 1 to renew the lease, send it to alice@example.com."
→ get_current_time()                                     # anchor absolute date
→ add_reminder(text="renew the lease", when="2026-11-01", email="alice@example.com")

User: "What reminders do I have?"
→ list_reminders()

User: "Show past ones too."
→ list_reminders(include_past=true)

User: "Push reminder 3 to next week."
→ update_reminder(id=3, email="<same address as before>", when="next week")

User: "Change reminder 3's text to 'call dad'."
→ update_reminder(id=3, email="<same address as before>", text="call dad")

User: "Switch reminder 3's email to bob@example.com."
→ update_reminder(id=3, email="bob@example.com")

User: "Delete reminder 3."
→ delete_reminder(id=3)

User: "What time is it?"
→ get_current_time()

## Rules

- `email` is REQUIRED on `add_reminder` and on `update_reminder`. Never omit it.
- If the user didn't give an address, ASK for one before calling the tool. Do not invent one.
- When updating a reminder and the user didn't mention email, reuse the current
  address from `list_reminders` — but still pass it explicitly, since the
  parameter is required.
- Pass `when` VERBATIM. Never convert relative times to dates — the server parses everything.
- Accepted forms: "10 days", "in 2 hours", "30m", "2w", "tomorrow", "next week", "2026-11-01", "2026-11-01T14:00".
- Bare words ("tomorrow", "next week") and date-only strings land at 09:00 local.
- Call `get_current_time()` ONLY to anchor an absolute date. Never before a relative one.
- Never guess an id — call `list_reminders` first.
- Past times and gibberish are rejected. Tell the user; don't retry silently.
