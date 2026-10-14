# Reminder Skill

Five tools for scheduled reminders. Load this once before first use.

## Tools

- `add_reminder(text, when)`
- `list_reminders(include_past?, limit?)` — soonest first; default 20, max 50
- `update_reminder(id, text?, when?)` — at least one of text / when
- `delete_reminder(id)`
- `get_current_time()`

## Examples

User: "Remind me to call mom tomorrow."
→ add_reminder(text="call mom", when="tomorrow")

User: "In 30 minutes, remind me to check the oven."
→ add_reminder(text="check the oven", when="30 minutes")

User: "What reminders do I have?"
→ list_reminders()

User: "Show past ones too."
→ list_reminders(include_past=true)

User: "Push reminder 3 to next week."
→ update_reminder(id=3, when="next week")

User: "Change reminder 3's text to 'call dad'."
→ update_reminder(id=3, text="call dad")

User: "Delete reminder 3."
→ delete_reminder(id=3)

User: "What time is it?"
→ get_current_time()

User: "Remind me on Nov 1 to renew the lease."
→ get_current_time()                                     # anchor absolute date
→ add_reminder(text="renew the lease", when="2026-11-01")

## Rules

- Pass `when` VERBATIM. Never convert relative times to dates — the server parses everything.
- Accepted forms: "10 days", "in 2 hours", "30m", "2w", "tomorrow", "next week", "2026-11-01", "2026-11-01T14:00".
- Bare words ("tomorrow", "next week") and date-only strings land at 09:00 local.
- Call `get_current_time()` ONLY to anchor an absolute date. Never before a relative one.
- Never guess an id — call `list_reminders` first.
- Past times and gibberish are rejected. Tell the user; don't retry silently.
