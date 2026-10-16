import type { Scope } from "./auth";

export type Risk = "low" | "medium" | "high" | "critical";

export type ToolPolicy = { risk: Risk; scope: Scope };

/**
 * Central policy table for every Discord tool.
 * - low      : verified user, no prompt
 * - medium   : prompt once; "Allow 15 min" creates a session
 * - high     : prompt every time
 * - critical : prompt every time; never sessionable
 *
 * Anything missing falls back to: GET => low/read, otherwise high/write.
 */
export const TOOL_POLICY: Record<string, ToolPolicy> = {
  // Bot
  discord_get_bot: { risk: "low", scope: "read" },
  discord_modify_bot: { risk: "critical", scope: "admin" },
  discord_list_bot_guilds: { risk: "low", scope: "read" },
  discord_leave_guild: { risk: "critical", scope: "admin" },

  // Users / DMs
  discord_get_user: { risk: "low", scope: "read" },
  discord_create_dm: { risk: "medium", scope: "write" },
  discord_send_dm: { risk: "medium", scope: "write" },

  // Guilds
  discord_get_guild: { risk: "low", scope: "read" },
  discord_modify_guild: { risk: "critical", scope: "admin" },
  discord_list_guild_channels: { risk: "low", scope: "read" },
  discord_create_guild_channel: { risk: "high", scope: "manage" },
  discord_list_guild_roles: { risk: "low", scope: "read" },
  discord_create_guild_role: { risk: "high", scope: "manage" },
  discord_modify_guild_role: { risk: "high", scope: "manage" },
  discord_delete_guild_role: { risk: "critical", scope: "admin" },
  discord_list_guild_members: { risk: "low", scope: "read" },
  discord_get_guild_member: { risk: "low", scope: "read" },
  discord_modify_guild_member: { risk: "high", scope: "moderate" },
  discord_kick_guild_member: { risk: "critical", scope: "moderate" },
  discord_add_member_role: { risk: "high", scope: "moderate" },
  discord_remove_member_role: { risk: "high", scope: "moderate" },
  discord_list_guild_bans: { risk: "low", scope: "read" },
  discord_ban_guild_member: { risk: "critical", scope: "moderate" },
  discord_unban_guild_member: { risk: "high", scope: "moderate" },
  discord_list_guild_invites: { risk: "low", scope: "read" },
  discord_list_guild_emojis: { risk: "low", scope: "read" },
  discord_list_guild_scheduled_events: { risk: "low", scope: "read" },
  discord_get_guild_scheduled_event: { risk: "low", scope: "read" },
  discord_create_guild_scheduled_event: { risk: "medium", scope: "manage" },
  discord_modify_guild_scheduled_event: { risk: "medium", scope: "manage" },
  discord_delete_guild_scheduled_event: { risk: "high", scope: "manage" },

  // Channels
  discord_get_channel: { risk: "low", scope: "read" },
  discord_modify_channel: { risk: "high", scope: "manage" },
  discord_delete_channel: { risk: "critical", scope: "admin" },
  discord_list_channel_invites: { risk: "low", scope: "read" },
  discord_create_channel_invite: { risk: "medium", scope: "manage" },
  discord_list_pinned_messages: { risk: "low", scope: "read" },
  discord_pin_message: { risk: "medium", scope: "write" },
  discord_unpin_message: { risk: "medium", scope: "write" },

  // Messages
  discord_list_messages: { risk: "low", scope: "read" },
  discord_get_message: { risk: "low", scope: "read" },
  discord_send_message: { risk: "medium", scope: "write" },
  discord_reply_message: { risk: "medium", scope: "write" },
  discord_edit_message: { risk: "medium", scope: "write" },
  discord_delete_message: { risk: "high", scope: "moderate" },
  discord_bulk_delete_messages: { risk: "critical", scope: "moderate" },
  discord_add_reaction: { risk: "low", scope: "write" },
  discord_remove_own_reaction: { risk: "low", scope: "write" },
  discord_remove_user_reaction: { risk: "medium", scope: "moderate" },
  discord_remove_all_reactions: { risk: "high", scope: "moderate" },
  discord_list_reactions: { risk: "low", scope: "read" },

  // Threads
  discord_start_thread_from_message: { risk: "medium", scope: "write" },
  discord_start_thread: { risk: "medium", scope: "write" },
  discord_list_active_threads: { risk: "low", scope: "read" },
  discord_list_archived_threads: { risk: "low", scope: "read" },
  discord_join_thread: { risk: "low", scope: "write" },
  discord_leave_thread: { risk: "low", scope: "write" },
  discord_add_thread_member: { risk: "medium", scope: "write" },
  discord_remove_thread_member: { risk: "medium", scope: "write" },
  discord_list_thread_members: { risk: "low", scope: "read" },
  discord_get_thread_member: { risk: "low", scope: "read" },

  // Webhooks
  discord_list_channel_webhooks: { risk: "low", scope: "read" },
  discord_get_webhook: { risk: "low", scope: "read" },
  discord_create_webhook: { risk: "high", scope: "manage" },
  discord_modify_webhook: { risk: "high", scope: "manage" },
  discord_delete_webhook: { risk: "high", scope: "manage" },
  discord_execute_webhook: { risk: "medium", scope: "write" },

  // Audit log
  discord_get_audit_log: { risk: "low", scope: "read" },

  // Escape hatch — treat as admin/critical, never sessionable.
  discord_request: { risk: "critical", scope: "admin" },
};

export function policyFor(name: string, method: string): ToolPolicy {
  const explicit = TOOL_POLICY[name];
  if (explicit) return explicit;
  return method === "GET"
    ? { risk: "low", scope: "read" }
    : { risk: "high", scope: "write" };
}
