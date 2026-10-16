# Reminder Skill

Five tools for scheduled reminders. Load this once before first use.

## Tools

- `add_reminder(text, when, discord_user_id)` — `discord_user_id` is REQUIRED
- `list_reminders(include_past?, limit?)` — soonest first; default 20, max 50
- `update_reminder(id, discord_user_id, text?, when?)` — `discord_user_id` is REQUIRED; text/when optional
- `delete_reminder(id)`
- `get_current_time()`

When a reminder is due, the server DMs its text to `discord_user_id`. A
background scheduler runs every 30 seconds and delivers each pending reminder.
There is no global default — every reminder carries its own target.

`discord_user_id` is a Discord snowflake (a 17–20 digit string). The user must
provide it. There is no way to look up a user by username, so do not guess.

## Examples

User: "Remind me to call mom tomorrow, DM me at 123456789012345678."
→ add_reminder(text="call mom", when="tomorrow", discord_user_id="123456789012345678")

User: "In 30 minutes, remind me to check the oven — my ID is 123456789012345678."
→ add_reminder(text="check the oven", when="30 minutes", discord_user_id="123456789012345678")

User: "Remind me on Nov 1 to renew the lease, DM 123456789012345678."
→ get_current_time()                                     # anchor absolute date
→ add_reminder(text="renew the lease", when="2026-11-01", discord_user_id="123456789012345678")

User: "What reminders do I have?"
→ list_reminders()

User: "Show past ones too."
→ list_reminders(include_past=true)

User: "Push reminder 3 to next week."
→ update_reminder(id=3, discord_user_id="<same ID as before>", when="next week")

User: "Change reminder 3's text to 'call dad'."
→ update_reminder(id=3, discord_user_id="<same ID as before>", text="call dad")

User: "Send reminder 3 to 987654321098765432 instead."
→ update_reminder(id=3, discord_user_id="987654321098765432")

User: "Delete reminder 3."
→ delete_reminder(id=3)

User: "What time is it?"
→ get_current_time()

## Rules

- `discord_user_id` is REQUIRED on `add_reminder` and on `update_reminder`. Never omit it.
- If the user didn't give an ID, ASK for one before calling the tool. Do not invent one.
- When updating a reminder and the user didn't mention an ID, reuse the current
  one from `list_reminders` — but still pass it explicitly, since the parameter
  is required.
- Pass `when` VERBATIM. Never convert relative times to dates — the server parses everything.
- Accepted forms: "10 days", "in 2 hours", "30m", "2w", "tomorrow", "next week", "2026-11-01", "2026-11-01T14:00".
- Bare words ("tomorrow", "next week") and date-only strings land at 09:00 local.
- Call `get_current_time()` ONLY to anchor an absolute date. Never before a relative one.
- Never guess an id — call `list_reminders` first.
- Past times and gibberish are rejected. Tell the user; don't retry silently.

## Delivery

- A background scheduler polls every 30 seconds and DMs pending reminders.
- Successful sends are recorded once; failed sends retry up to 3 times, then stop.
- The bot must share a guild with the target user (or that user must accept DMs
  from non-friends) for the DM to land. If delivery fails repeatedly, tell the
  user — don't silently loop.
