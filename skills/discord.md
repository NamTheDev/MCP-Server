# Discord Skill

Read/write access to a single Discord guild via the REST API. Load this once before first use.

## Tools

**Bot & users**
- `discord_get_bot()` · `discord_modify_bot(username?, avatar?, banner?)`
- `discord_list_bot_guilds()` · `discord_leave_guild(guild_id, reason?)`
- `discord_get_user(user_id)`
- `discord_create_dm(recipient_id)` — returns a channel
- `discord_send_dm(user_id, content?, embeds?, tts?)` — one-shot DM

**Guilds**
- `discord_get_guild(guild_id, with_counts?)` · `discord_modify_guild(guild_id, ..., reason?)`
- `discord_list_guild_channels(guild_id)` · `discord_create_guild_channel(guild_id, name, ..., reason?)`
- `discord_list_guild_roles(guild_id)` · `discord_create_guild_role(guild_id, name, ..., reason?)` · `discord_modify_guild_role(guild_id, role_id, ..., reason?)` · `discord_delete_guild_role(guild_id, role_id, reason?)`
- `discord_list_guild_members(guild_id, limit?, after?)` · `discord_get_guild_member(guild_id, user_id)` · `discord_modify_guild_member(guild_id, user_id, ..., reason?)` · `discord_kick_guild_member(guild_id, user_id, reason?)`
- `discord_add_member_role(guild_id, user_id, role_id, reason?)` · `discord_remove_member_role(guild_id, user_id, role_id, reason?)`
- `discord_list_guild_bans(guild_id)` · `discord_ban_guild_member(guild_id, user_id, delete_message_seconds?, reason?)` · `discord_unban_guild_member(guild_id, user_id, reason?)`
- `discord_list_guild_invites(guild_id)` · `discord_list_guild_emojis(guild_id)`
- `discord_list_guild_scheduled_events(guild_id, with_user_count?)` · `discord_get_guild_scheduled_event(...)` · `discord_create_guild_scheduled_event(..., reason?)` · `discord_modify_guild_scheduled_event(..., reason?)` · `discord_delete_guild_scheduled_event(guild_id, event_id, reason?)`

**Channels**
- `discord_get_channel(channel_id)` · `discord_modify_channel(channel_id, ..., reason?)` · `discord_delete_channel(channel_id, reason?)`
- `discord_list_channel_invites(channel_id)` · `discord_create_channel_invite(channel_id, ...)`
- `discord_list_pinned_messages(channel_id, raw?)` · `discord_pin_message(channel_id, message_id)` · `discord_unpin_message(channel_id, message_id)`

**Messages**
- `discord_list_messages(channel_id, limit?, before?, after?, around?, raw?)`
- `discord_get_message(channel_id, message_id, raw?)`
- `discord_send_message(channel_id, content?, embeds?, ..., raw?)` · `discord_reply_message(channel_id, message_id, content?, ..., raw?)`
- `discord_edit_message(channel_id, message_id, content?, embeds?, ..., raw?)` · `discord_delete_message(channel_id, message_id, reason?)`
- `discord_bulk_delete_messages(channel_id, message_ids[2..100], reason?)`
- `discord_add_reaction(channel_id, message_id, emoji)` · `discord_remove_own_reaction(...)` · `discord_remove_user_reaction(..., user_id)` · `discord_remove_all_reactions(channel_id, message_id, emoji?)` · `discord_list_reactions(channel_id, message_id, emoji, limit?, after?)`

**Threads**
- `discord_start_thread_from_message(channel_id, message_id, name, ...)` · `discord_start_thread(channel_id, name, type?, ...)`
- `discord_list_active_threads(channel_id)` · `discord_list_archived_threads(channel_id, type?, ...)`
- `discord_join_thread(channel_id)` · `discord_leave_thread(channel_id)`
- `discord_add_thread_member(channel_id, user_id)` · `discord_remove_thread_member(channel_id, user_id)` · `discord_list_thread_members(channel_id)` · `discord_get_thread_member(channel_id, user_id)`

**Webhooks**
- `discord_list_channel_webhooks(channel_id)` · `discord_get_webhook(webhook_id)` · `discord_create_webhook(channel_id, name, avatar?, reason?)` · `discord_modify_webhook(webhook_id, ..., reason?)` · `discord_delete_webhook(webhook_id, reason?)` · `discord_execute_webhook(webhook_id, webhook_token, ...)`

**Audit log**
- `discord_get_audit_log(guild_id, user_id?, action_type?, before?, after?, limit?, bot_only?, raw?)` — read-back for every write. Requires VIEW_AUDIT_LOG (bot must be admin).

**Escape hatch**
- `discord_request(method, path, body?, reason?)` — raw REST call for anything not covered.

## Read-back

After a mutating call, verify with:

| Write | Read back with |
|---|---|
| `discord_modify_bot` | `discord_get_bot` |
| `discord_leave_guild` | `discord_list_bot_guilds` (absence) |
| `discord_send_dm` | `discord_list_messages` on the returned `channel_id` |
| `discord_modify_guild` | `discord_get_guild` |
| `discord_create_guild_channel` | `discord_list_guild_channels` |
| `discord_modify_channel` | `discord_get_channel` |
| `discord_delete_channel` | `discord_get_channel` (404) |
| `discord_create_guild_role` / `modify` / `delete` | `discord_list_guild_roles` |
| `discord_modify_guild_member` | `discord_get_guild_member` |
| `discord_kick_guild_member` | `discord_get_guild_member` (404) |
| `discord_add_member_role` / `remove` | `discord_get_guild_member` (roles array) |
| `discord_ban_guild_member` / `unban` | `discord_list_guild_bans` |
| `discord_create_guild_scheduled_event` / `modify` | `discord_get_guild_scheduled_event` |
| `discord_delete_guild_scheduled_event` | `discord_list_guild_scheduled_events` (absence) |
| `discord_create_channel_invite` | `discord_list_channel_invites` |
| `discord_pin_message` / `unpin` | `discord_list_pinned_messages` |
| `discord_send_message` / `reply` / `edit` | `discord_get_message` |
| `discord_delete_message` | `discord_get_message` (404) |
| `discord_bulk_delete_messages` | `discord_list_messages` (absence) |
| `discord_add_reaction` / `remove_*` | `discord_list_reactions` |
| `discord_start_thread*` | `discord_list_active_threads` |
| `discord_join_thread` / `leave` | `discord_list_thread_members` |
| `discord_add_thread_member` / `remove` | `discord_list_thread_members` |
| `discord_create_webhook` | `discord_list_channel_webhooks` |
| `discord_modify_webhook` / `delete` | `discord_get_webhook` |

**Catch-all:** `discord_get_audit_log(guild_id, bot_only=true)` shows every action the bot performed, newest first, with the `reason` you passed. This is the fastest way to confirm a batch of writes landed.

## Rules

- The bot is in **one guild**. Call `discord_list_bot_guilds()` once and reuse the ID.
- IDs are **strings** (snowflakes). Never coerce to number.
- Message reads default to a **summarized view**. Pass `raw=true` for the full payload.
- Rate limits (429) and transient 5xx are retried automatically with backoff. Don't loop hammer endpoints.
- `content` limit is **2000 chars**. Use `embeds` for longer/structured output.
- File uploads (multipart `files[]`) are **not** supported; use `embeds` with image URLs or the generic `discord_request`.
- `reason` (max 512 chars) sets `X-Audit-Log-Reason`. It is NOT returned by the API — read it back with `discord_get_audit_log`.
- Destructive ops (`*_delete_*`, `*_kick_*`, `*_ban_*`, `discord_leave_guild`, bulk-delete) are real — confirm intent before calling.
- **Always read back after a write** using the table above, unless you have a reason not to.
