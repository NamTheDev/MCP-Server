import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { discordFetch } from "../utils/discord";
import { msg } from "../utils/errors";
import { err, ok } from "../utils/mcp";

type Method = "GET" | "POST" | "PATCH" | "PUT" | "DELETE";
interface Call {
  method: Method;
  path: string;
  body?: unknown;
  /** Audit-log reason. Sent as X-Audit-Log-Reason (URL-encoded, 512 char cap). */
  reason?: string;
}

const qs = (p: Record<string, string | number | boolean | undefined>): string => {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(p)) if (v !== undefined) u.set(k, String(v));
  const s = u.toString();
  return s ? `?${s}` : "";
};
const snowflakeTime = (id: string): string => {
  const ms = (BigInt(id) >> 22n) + 1420070400000n;
  return new Date(Number(ms)).toISOString();
};

const ACTION_NAMES: Record<number, string> = {
  1: "GUILD_UPDATE",
  10: "CHANNEL_CREATE", 11: "CHANNEL_UPDATE", 12: "CHANNEL_DELETE",
  13: "CHANNEL_OVERWRITE_CREATE", 14: "CHANNEL_OVERWRITE_UPDATE", 15: "CHANNEL_OVERWRITE_DELETE",
  20: "MEMBER_KICK", 21: "MEMBER_PRUNE", 22: "MEMBER_BAN_ADD", 23: "MEMBER_BAN_REMOVE",
  24: "MEMBER_UPDATE", 25: "MEMBER_ROLE_UPDATE", 26: "MEMBER_MOVE", 27: "MEMBER_DISCONNECT",
  28: "BOT_ADD",
  30: "ROLE_CREATE", 31: "ROLE_UPDATE", 32: "ROLE_DELETE",
  40: "INVITE_CREATE", 41: "INVITE_UPDATE", 42: "INVITE_DELETE",
  50: "WEBHOOK_CREATE", 51: "WEBHOOK_UPDATE", 52: "WEBHOOK_DELETE",
  60: "EMOJI_CREATE", 61: "EMOJI_UPDATE", 62: "EMOJI_DELETE",
  72: "MESSAGE_DELETE", 73: "MESSAGE_BULK_DELETE", 74: "MESSAGE_PIN", 75: "MESSAGE_UNPIN",
  80: "INTEGRATION_CREATE", 81: "INTEGRATION_UPDATE", 82: "INTEGRATION_DELETE",
  83: "STAGE_INSTANCE_CREATE", 84: "STAGE_INSTANCE_UPDATE", 85: "STAGE_INSTANCE_DELETE",
  90: "STICKER_CREATE", 91: "STICKER_UPDATE", 92: "STICKER_DELETE",
  100: "THREAD_CREATE", 101: "THREAD_UPDATE", 102: "THREAD_DELETE",
  110: "STAGE_INSTANCE_CREATE", 111: "STAGE_INSTANCE_UPDATE", 112: "STAGE_INSTANCE_DELETE",
  121: "GUILD_SCHEDULED_EVENT_CREATE", 122: "GUILD_SCHEDULED_EVENT_UPDATE", 123: "GUILD_SCHEDULED_EVENT_DELETE",
};

const fmtAuditEntry = (e: any, users: Record<string, any>): string => {
  const when = snowflakeTime(String(e.id));
  const name = ACTION_NAMES[e.action_type] ?? `ACTION_${e.action_type}`;
  const user = e.user_id ? users[e.user_id] : null;
  const who = user
    ? `${user.username}${user.discriminator && user.discriminator !== "0" ? "#" + user.discriminator : ""} (${user.id})`
    : (e.user_id ?? "unknown");
  const parts = [`${when} [${e.action_type} ${name}] by ${who}`];
  if (e.target_id) parts.push(`target=${e.target_id}`);
  if (e.reason) parts.push(`reason=${JSON.stringify(e.reason)}`);
  if (e.changes?.length) parts.push(`changes=${JSON.stringify(e.changes)}`);
  if (e.options && Object.keys(e.options).length) parts.push(`options=${JSON.stringify(e.options)}`);
  return parts.join(" ");
};


const summarizeMessage = (m: any): unknown => {
  if (!m || typeof m !== "object") return m;
  const out: Record<string, unknown> = {
    id: m.id,
    channel_id: m.channel_id,
    author: m.author && {
      id: m.author.id,
      username: m.author.username,
      global_name: m.author.global_name,
      bot: m.author.bot,
    },
    content: m.content,
    timestamp: m.timestamp,
    edited_timestamp: m.edited_timestamp,
  };
  if (m.attachments?.length) {
    out.attachments = m.attachments.map((a: any) => ({
      id: a.id, filename: a.filename, url: a.url,
      content_type: a.content_type, size: a.size,
    }));
  }
  if (m.embeds?.length) out.embeds = m.embeds;
  if (m.reactions?.length) out.reactions = m.reactions;
  if (m.referenced_message) {
    out.referenced_message = {
      id: m.referenced_message.id,
      author: m.referenced_message.author && {
        id: m.referenced_message.author.id,
        username: m.referenced_message.author.username,
      },
      content: m.referenced_message.content,
    };
  }
  if (m.thread) out.thread = { id: m.thread.id, name: m.thread.name };
  if (m.pinned) out.pinned = true;
  return out;
};

const fmtMsg = (d: unknown, raw: boolean | undefined): string => {
  if (d === undefined) return "ok";
  if (raw) return JSON.stringify(d);
  if (Array.isArray(d)) return JSON.stringify(d.map(summarizeMessage));
  return JSON.stringify(summarizeMessage(d));
};

function defineTool(
  server: McpServer,
  name: string,
  description: string,
  inputSchema: any,
  build: (a: any) => Call,
  format: (d: unknown, a: any) => string = (d) =>
    d === undefined ? "ok" : JSON.stringify(d),
): void {
  server.registerTool(
    name,
    { description, inputSchema },
    async (args: any) => {
      try {
        const { method, path, body, reason } = build(args);
        const init: RequestInit = { method };
        if (body !== undefined) init.body = JSON.stringify(body);
        if (reason !== undefined && reason !== "") {
          init.headers = {
            "X-Audit-Log-Reason": encodeURIComponent(reason.slice(0, 512)),
          };
        }
        const data = await discordFetch<unknown>(path, init);
        return ok(format(data, args));
      } catch (e) {
        return err(`${name}: ${msg(e)}`);
      }
    },
  );
}

const embed = z.record(z.string(), z.unknown());
const reasonSchema = z.string().max(512).optional();

export function registerDiscordTools(server: McpServer): void {
  // ===================== Bot =====================
  defineTool(server, "discord_get_bot",
    "Get the bot's own user object.",
    {},
    () => ({ method: "GET", path: "/users/@me" }),
  );

  defineTool(server, "discord_modify_bot",
    "Modify the bot's own user. avatar/banner are data URIs (data:image/png;base64,...) or null to clear.",
    {
      username: z.string().min(2).max(32).optional(),
      avatar: z.string().nullable().optional(),
      banner: z.string().nullable().optional(),
    },
    (a) => ({ method: "PATCH", path: "/users/@me", body: a }),
  );

  defineTool(server, "discord_list_bot_guilds",
    "List guilds the bot is a member of.",
    {},
    () => ({ method: "GET", path: "/users/@me/guilds" }),
  );

  defineTool(server, "discord_leave_guild",
    "Leave a guild. `reason` shows in the audit log.",
    { guild_id: z.string().min(1), reason: reasonSchema },
    (a) => {
      const { reason, guild_id } = a;
      return { method: "DELETE", path: `/users/@me/guilds/${guild_id}`, reason };
    },
  );

  // ===================== Users / DMs =====================
  defineTool(server, "discord_get_user",
    "Get a user by ID.",
    { user_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/users/${a.user_id}` }),
  );

  defineTool(server, "discord_create_dm",
    "Create (or fetch) a DM channel with a user. Returns the channel object.",
    { recipient_id: z.string().min(1) },
    (a) => ({ method: "POST", path: "/users/@me/channels", body: { recipient_id: a.recipient_id } }),
  );

  server.registerTool(
    "discord_send_dm",
    {
      description: "Send a direct message to a user (opens the DM channel if needed).",
      inputSchema: {
        user_id: z.string().min(1),
        content: z.string().max(2000).optional(),
        embeds: z.array(embed).max(10).optional(),
        tts: z.boolean().optional(),
      },
    },
    async ({ user_id, content, embeds, tts }) => {
      try {
        const channel = await discordFetch<{ id: string }>("/users/@me/channels", {
          method: "POST",
          body: JSON.stringify({ recipient_id: user_id }),
        });
        const body: Record<string, unknown> = {};
        if (content !== undefined) body.content = content;
        if (embeds !== undefined) body.embeds = embeds;
        if (tts !== undefined) body.tts = tts;
        const m = await discordFetch(`/channels/${channel.id}/messages`, {
          method: "POST",
          body: JSON.stringify(body),
        });
        return ok(fmtMsg(m, false));
      } catch (e) {
        return err(`discord_send_dm: ${msg(e)}`);
      }
    },
  );

  // ===================== Guilds =====================
  defineTool(server, "discord_get_guild",
    "Get a guild by ID.",
    { guild_id: z.string().min(1), with_counts: z.boolean().optional() },
    (a) => ({ method: "GET", path: `/guilds/${a.guild_id}${qs({ with_counts: a.with_counts })}` }),
  );

  defineTool(server, "discord_modify_guild",
    "Modify a guild's settings. `reason` shows in the audit log.",
    {
      guild_id: z.string().min(1),
      name: z.string().min(2).max(100).optional(),
      description: z.string().nullable().optional(),
      verification_level: z.number().int().min(0).max(4).optional(),
      default_message_notifications: z.number().int().min(0).max(1).optional(),
      explicit_content_filter: z.number().int().min(0).max(2).optional(),
      afk_channel_id: z.string().nullable().optional(),
      afk_timeout: z.number().int().optional(),
      system_channel_id: z.string().nullable().optional(),
      rules_channel_id: z.string().nullable().optional(),
      public_updates_channel_id: z.string().nullable().optional(),
      preferred_locale: z.string().optional(),
      icon: z.string().nullable().optional(),
      banner: z.string().nullable().optional(),
      splash: z.string().nullable().optional(),
      discovery_splash: z.string().nullable().optional(),
      reason: reasonSchema,
    },
    (a) => {
      const { guild_id, reason, ...body } = a;
      return { method: "PATCH", path: `/guilds/${guild_id}`, body, reason };
    },
  );

  defineTool(server, "discord_list_guild_channels",
    "List all channels in a guild.",
    { guild_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/guilds/${a.guild_id}/channels` }),
  );

  defineTool(server, "discord_create_guild_channel",
    "Create a channel in a guild. type: 0=text, 2=voice, 4=category, 5=announcement, 13=stage, 15=forum, 16=media. `reason` shows in the audit log.",
    {
      guild_id: z.string().min(1),
      name: z.string().min(1).max(100),
      type: z.number().int().optional(),
      topic: z.string().max(1024).optional(),
      parent_id: z.string().optional(),
      position: z.number().int().optional(),
      nsfw: z.boolean().optional(),
      rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
      bitrate: z.number().int().optional(),
      user_limit: z.number().int().min(0).max(99).optional(),
      permission_overwrites: z.array(z.record(z.string(), z.unknown())).optional(),
      reason: reasonSchema,
    },
    (a) => {
      const { guild_id, reason, ...body } = a;
      return { method: "POST", path: `/guilds/${guild_id}/channels`, body, reason };
    },
  );

  defineTool(server, "discord_list_guild_roles",
    "List all roles in a guild.",
    { guild_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/guilds/${a.guild_id}/roles` }),
  );

  defineTool(server, "discord_create_guild_role",
    "Create a role in a guild. `permissions` is a bitfield string. `reason` shows in the audit log.",
    {
      guild_id: z.string().min(1),
      name: z.string().max(100).optional(),
      permissions: z.string().optional(),
      color: z.number().int().min(0).max(0xffffff).optional(),
      hoist: z.boolean().optional(),
      mentionable: z.boolean().optional(),
      unicode_emoji: z.string().optional(),
      reason: reasonSchema,
    },
    (a) => {
      const { guild_id, reason, ...body } = a;
      return { method: "POST", path: `/guilds/${guild_id}/roles`, body, reason };
    },
  );

  defineTool(server, "discord_modify_guild_role",
    "Modify a guild role. `reason` shows in the audit log.",
    {
      guild_id: z.string().min(1),
      role_id: z.string().min(1),
      name: z.string().max(100).optional(),
      permissions: z.string().optional(),
      color: z.number().int().min(0).max(0xffffff).optional(),
      hoist: z.boolean().optional(),
      mentionable: z.boolean().optional(),
      unicode_emoji: z.string().nullable().optional(),
      reason: reasonSchema,
    },
    (a) => {
      const { guild_id, role_id, reason, ...body } = a;
      return { method: "PATCH", path: `/guilds/${guild_id}/roles/${role_id}`, body, reason };
    },
  );

  defineTool(server, "discord_delete_guild_role",
    "Delete a guild role. `reason` shows in the audit log.",
    { guild_id: z.string().min(1), role_id: z.string().min(1), reason: reasonSchema },
    (a) => ({
      method: "DELETE",
      path: `/guilds/${a.guild_id}/roles/${a.role_id}`,
      reason: a.reason,
    }),
  );

  defineTool(server, "discord_list_guild_members",
    "List guild members. Requires GUILD_MEMBERS privileged intent enabled in the Dev Portal. limit 1-1000 (default 1).",
    {
      guild_id: z.string().min(1),
      limit: z.number().int().min(1).max(1000).optional(),
      after: z.string().optional(),
    },
    (a) => ({ method: "GET", path: `/guilds/${a.guild_id}/members${qs({ limit: a.limit, after: a.after })}` }),
  );

  defineTool(server, "discord_get_guild_member",
    "Get a single guild member.",
    { guild_id: z.string().min(1), user_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/guilds/${a.guild_id}/members/${a.user_id}` }),
  );

  defineTool(server, "discord_modify_guild_member",
    "Modify a guild member (nick, roles, mute, deaf, channel, timeout). `reason` shows in the audit log.",
    {
      guild_id: z.string().min(1),
      user_id: z.string().min(1),
      nick: z.string().max(32).nullable().optional(),
      roles: z.array(z.string()).optional(),
      mute: z.boolean().optional(),
      deaf: z.boolean().optional(),
      channel_id: z.string().nullable().optional(),
      communication_disabled_until: z.string().nullable().optional(),
      reason: reasonSchema,
    },
    (a) => {
      const { guild_id, user_id, reason, ...body } = a;
      return { method: "PATCH", path: `/guilds/${guild_id}/members/${user_id}`, body, reason };
    },
  );

  defineTool(server, "discord_kick_guild_member",
    "Kick a member from a guild. `reason` shows in the audit log.",
    { guild_id: z.string().min(1), user_id: z.string().min(1), reason: reasonSchema },
    (a) => ({
      method: "DELETE",
      path: `/guilds/${a.guild_id}/members/${a.user_id}`,
      reason: a.reason,
    }),
  );

  defineTool(server, "discord_add_member_role",
    "Add a role to a guild member. `reason` shows in the audit log.",
    {
      guild_id: z.string().min(1),
      user_id: z.string().min(1),
      role_id: z.string().min(1),
      reason: reasonSchema,
    },
    (a) => ({
      method: "PUT",
      path: `/guilds/${a.guild_id}/members/${a.user_id}/roles/${a.role_id}`,
      reason: a.reason,
    }),
  );

  defineTool(server, "discord_remove_member_role",
    "Remove a role from a guild member. `reason` shows in the audit log.",
    {
      guild_id: z.string().min(1),
      user_id: z.string().min(1),
      role_id: z.string().min(1),
      reason: reasonSchema,
    },
    (a) => ({
      method: "DELETE",
      path: `/guilds/${a.guild_id}/members/${a.user_id}/roles/${a.role_id}`,
      reason: a.reason,
    }),
  );

  defineTool(server, "discord_list_guild_bans",
    "List bans for a guild.",
    { guild_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/guilds/${a.guild_id}/bans` }),
  );

  defineTool(server, "discord_ban_guild_member",
    "Ban a user from a guild. delete_message_seconds: 0-604800. `reason` shows in the audit log.",
    {
      guild_id: z.string().min(1),
      user_id: z.string().min(1),
      delete_message_seconds: z.number().int().min(0).max(604800).optional(),
      reason: reasonSchema,
    },
    (a) => {
      const { guild_id, user_id, reason, ...body } = a;
      return { method: "PUT", path: `/guilds/${guild_id}/bans/${user_id}`, body, reason };
    },
  );

  defineTool(server, "discord_unban_guild_member",
    "Unban a user from a guild. `reason` shows in the audit log.",
    { guild_id: z.string().min(1), user_id: z.string().min(1), reason: reasonSchema },
    (a) => ({
      method: "DELETE",
      path: `/guilds/${a.guild_id}/bans/${a.user_id}`,
      reason: a.reason,
    }),
  );

  defineTool(server, "discord_list_guild_invites",
    "List active invites for a guild.",
    { guild_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/guilds/${a.guild_id}/invites` }),
  );

  defineTool(server, "discord_list_guild_emojis",
    "List emojis in a guild.",
    { guild_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/guilds/${a.guild_id}/emojis` }),
  );

  defineTool(server, "discord_list_guild_scheduled_events",
    "List scheduled events in a guild.",
    { guild_id: z.string().min(1), with_user_count: z.boolean().optional() },
    (a) => ({ method: "GET", path: `/guilds/${a.guild_id}/scheduled-events${qs({ with_user_count: a.with_user_count })}` }),
  );

  defineTool(server, "discord_get_guild_scheduled_event",
    "Get one scheduled event.",
    { guild_id: z.string().min(1), event_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/guilds/${a.guild_id}/scheduled-events/${a.event_id}` }),
  );

  defineTool(server, "discord_create_guild_scheduled_event",
    "Create a scheduled event. entity_type: 1=stage, 2=voice, 3=external. privacy_level: 2=guild_only. `reason` shows in the audit log.",
    {
      guild_id: z.string().min(1),
      name: z.string().min(1).max(100),
      privacy_level: z.number().int(),
      scheduled_start_time: z.string(),
      entity_type: z.number().int(),
      channel_id: z.string().optional(),
      entity_metadata: z.record(z.string(), z.unknown()).optional(),
      scheduled_end_time: z.string().optional(),
      description: z.string().max(1000).optional(),
      image: z.string().optional(),
      reason: reasonSchema,
    },
    (a) => {
      const { guild_id, reason, ...body } = a;
      return { method: "POST", path: `/guilds/${guild_id}/scheduled-events`, body, reason };
    },
  );

  defineTool(server, "discord_modify_guild_scheduled_event",
    "Modify a scheduled event. status: 1=scheduled, 2=active, 3=completed, 4=canceled. `reason` shows in the audit log.",
    {
      guild_id: z.string().min(1),
      event_id: z.string().min(1),
      name: z.string().max(100).optional(),
      description: z.string().max(1000).nullable().optional(),
      channel_id: z.string().nullable().optional(),
      scheduled_start_time: z.string().optional(),
      scheduled_end_time: z.string().nullable().optional(),
      status: z.number().int().optional(),
      image: z.string().nullable().optional(),
      entity_metadata: z.record(z.string(), z.unknown()).nullable().optional(),
      reason: reasonSchema,
    },
    (a) => {
      const { guild_id, event_id, reason, ...body } = a;
      return { method: "PATCH", path: `/guilds/${guild_id}/scheduled-events/${event_id}`, body, reason };
    },
  );

  defineTool(server, "discord_delete_guild_scheduled_event",
    "Delete a scheduled event. `reason` shows in the audit log.",
    { guild_id: z.string().min(1), event_id: z.string().min(1), reason: reasonSchema },
    (a) => ({
      method: "DELETE",
      path: `/guilds/${a.guild_id}/scheduled-events/${a.event_id}`,
      reason: a.reason,
    }),
  );

  // ===================== Channels =====================
  defineTool(server, "discord_get_channel",
    "Get a channel by ID.",
    { channel_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/channels/${a.channel_id}` }),
  );

  defineTool(server, "discord_modify_channel",
    "Modify a channel. `reason` shows in the audit log.",
    {
      channel_id: z.string().min(1),
      name: z.string().min(1).max(100).optional(),
      type: z.number().int().optional(),
      position: z.number().int().optional(),
      topic: z.string().max(1024).nullable().optional(),
      nsfw: z.boolean().optional(),
      rate_limit_per_user: z.number().int().min(0).max(21600).optional(),
      bitrate: z.number().int().optional(),
      user_limit: z.number().int().min(0).max(99).optional(),
      parent_id: z.string().nullable().optional(),
      rtc_region: z.string().nullable().optional(),
      video_quality_mode: z.number().int().optional(),
      default_auto_archive_duration: z.number().int().optional(),
      archived: z.boolean().optional(),
      auto_archive_duration: z.number().int().optional(),
      locked: z.boolean().optional(),
      invitable: z.boolean().optional(),
      applied_tags: z.array(z.string()).optional(),
      reason: reasonSchema,
    },
    (a) => {
      const { channel_id, reason, ...body } = a;
      return { method: "PATCH", path: `/channels/${channel_id}`, body, reason };
    },
  );

  defineTool(server, "discord_delete_channel",
    "Delete a channel. `reason` shows in the audit log.",
    { channel_id: z.string().min(1), reason: reasonSchema },
    (a) => ({ method: "DELETE", path: `/channels/${a.channel_id}`, reason: a.reason }),
  );

  defineTool(server, "discord_list_channel_invites",
    "List invites for a channel.",
    { channel_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/channels/${a.channel_id}/invites` }),
  );

  defineTool(server, "discord_create_channel_invite",
    "Create an invite for a channel.",
    {
      channel_id: z.string().min(1),
      max_age: z.number().int().min(0).optional(),
      max_uses: z.number().int().min(0).optional(),
      temporary: z.boolean().optional(),
      unique: z.boolean().optional(),
      target_type: z.number().int().optional(),
      target_user_id: z.string().optional(),
      target_application_id: z.string().optional(),
    },
    (a) => {
      const { channel_id, ...body } = a;
      return { method: "POST", path: `/channels/${channel_id}/invites`, body };
    },
  );

  defineTool(server, "discord_list_pinned_messages",
    "List pinned messages in a channel.",
    { channel_id: z.string().min(1), raw: z.boolean().optional() },
    (a) => ({ method: "GET", path: `/channels/${a.channel_id}/pins` }),
    (d, a) => fmtMsg(d, a.raw),
  );

  defineTool(server, "discord_pin_message",
    "Pin a message in a channel.",
    { channel_id: z.string().min(1), message_id: z.string().min(1) },
    (a) => ({ method: "PUT", path: `/channels/${a.channel_id}/pins/${a.message_id}` }),
  );

  defineTool(server, "discord_unpin_message",
    "Unpin a message in a channel.",
    { channel_id: z.string().min(1), message_id: z.string().min(1) },
    (a) => ({ method: "DELETE", path: `/channels/${a.channel_id}/pins/${a.message_id}` }),
  );

  // ===================== Messages =====================
  defineTool(server, "discord_list_messages",
    "List messages in a channel. limit 1-100 (default 50). raw=true for full payloads.",
    {
      channel_id: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
      before: z.string().optional(),
      after: z.string().optional(),
      around: z.string().optional(),
      raw: z.boolean().optional(),
    },
    (a) => ({
      method: "GET",
      path: `/channels/${a.channel_id}/messages${qs({ limit: a.limit, before: a.before, after: a.after, around: a.around })}`,
    }),
    (d, a) => fmtMsg(d, a.raw),
  );

  defineTool(server, "discord_get_message",
    "Get one message by channel + message ID. raw=true for full payload.",
    {
      channel_id: z.string().min(1),
      message_id: z.string().min(1),
      raw: z.boolean().optional(),
    },
    (a) => ({ method: "GET", path: `/channels/${a.channel_id}/messages/${a.message_id}` }),
    (d, a) => fmtMsg(d, a.raw),
  );

  defineTool(server, "discord_send_message",
    "Send a message to a channel. content max 2000 chars. embeds max 10. raw=true for full payload.",
    {
      channel_id: z.string().min(1),
      content: z.string().max(2000).optional(),
      embeds: z.array(embed).max(10).optional(),
      tts: z.boolean().optional(),
      allowed_mentions: z.record(z.string(), z.unknown()).optional(),
      message_reference: z.record(z.string(), z.unknown()).optional(),
      components: z.array(z.record(z.string(), z.unknown())).optional(),
      sticker_ids: z.array(z.string()).optional(),
      flags: z.number().int().optional(),
      raw: z.boolean().optional(),
    },
    (a) => {
      const { channel_id, raw: _raw, ...body } = a;
      return { method: "POST", path: `/channels/${channel_id}/messages`, body };
    },
    (d, a) => fmtMsg(d, a.raw),
  );

  defineTool(server, "discord_reply_message",
    "Reply to a message in a channel (sets message_reference).",
    {
      channel_id: z.string().min(1),
      message_id: z.string().min(1),
      content: z.string().max(2000).optional(),
      embeds: z.array(embed).max(10).optional(),
      fail_if_not_exists: z.boolean().optional(),
      raw: z.boolean().optional(),
    },
    (a) => {
      const { channel_id, message_id, fail_if_not_exists, raw: _raw, ...rest } = a;
      return {
        method: "POST",
        path: `/channels/${channel_id}/messages`,
        body: {
          ...rest,
          message_reference: {
            message_id,
            fail_if_not_exists: fail_if_not_exists ?? true,
          },
        },
      };
    },
    (d, a) => fmtMsg(d, a.raw),
  );

  defineTool(server, "discord_edit_message",
    "Edit a message. Provide content and/or embeds and/or components.",
    {
      channel_id: z.string().min(1),
      message_id: z.string().min(1),
      content: z.string().max(2000).optional(),
      embeds: z.array(embed).max(10).optional(),
      components: z.array(z.record(z.string(), z.unknown())).nullable().optional(),
      flags: z.number().int().nullable().optional(),
      raw: z.boolean().optional(),
    },
    (a) => {
      const { channel_id, message_id, raw: _raw, ...body } = a;
      return { method: "PATCH", path: `/channels/${channel_id}/messages/${message_id}`, body };
    },
    (d, a) => fmtMsg(d, a.raw),
  );

  defineTool(server, "discord_delete_message",
    "Delete a message. `reason` shows in the audit log.",
    {
      channel_id: z.string().min(1),
      message_id: z.string().min(1),
      reason: reasonSchema,
    },
    (a) => ({
      method: "DELETE",
      path: `/channels/${a.channel_id}/messages/${a.message_id}`,
      reason: a.reason,
    }),
  );

  defineTool(server, "discord_bulk_delete_messages",
    "Bulk delete 2-100 messages in a channel (must be < 2 weeks old). `reason` shows in the audit log.",
    {
      channel_id: z.string().min(1),
      message_ids: z.array(z.string().min(1)).min(2).max(100),
      reason: reasonSchema,
    },
    (a) => ({
      method: "POST",
      path: `/channels/${a.channel_id}/messages/bulk-delete`,
      body: { messages: a.message_ids },
      reason: a.reason,
    }),
  );

  defineTool(server, "discord_add_reaction",
    "Add a reaction. emoji is the raw unicode char or `name:id` for custom.",
    { channel_id: z.string().min(1), message_id: z.string().min(1), emoji: z.string().min(1) },
    (a) => ({
      method: "PUT",
      path: `/channels/${a.channel_id}/messages/${a.message_id}/reactions/${encodeURIComponent(a.emoji)}/@me`,
    }),
  );

  defineTool(server, "discord_remove_own_reaction",
    "Remove the bot's own reaction.",
    { channel_id: z.string().min(1), message_id: z.string().min(1), emoji: z.string().min(1) },
    (a) => ({
      method: "DELETE",
      path: `/channels/${a.channel_id}/messages/${a.message_id}/reactions/${encodeURIComponent(a.emoji)}/@me`,
    }),
  );

  defineTool(server, "discord_remove_user_reaction",
    "Remove a specific user's reaction.",
    {
      channel_id: z.string().min(1),
      message_id: z.string().min(1),
      emoji: z.string().min(1),
      user_id: z.string().min(1),
    },
    (a) => ({
      method: "DELETE",
      path: `/channels/${a.channel_id}/messages/${a.message_id}/reactions/${encodeURIComponent(a.emoji)}/${a.user_id}`,
    }),
  );

  defineTool(server, "discord_remove_all_reactions",
    "Remove all reactions from a message (or all of a given emoji).",
    {
      channel_id: z.string().min(1),
      message_id: z.string().min(1),
      emoji: z.string().optional(),
    },
    (a) => ({
      method: "DELETE",
      path: a.emoji
        ? `/channels/${a.channel_id}/messages/${a.message_id}/reactions/${encodeURIComponent(a.emoji)}`
        : `/channels/${a.channel_id}/messages/${a.message_id}/reactions`,
    }),
  );

  defineTool(server, "discord_list_reactions",
    "List users who reacted with an emoji. limit 1-100 (default 25).",
    {
      channel_id: z.string().min(1),
      message_id: z.string().min(1),
      emoji: z.string().min(1),
      limit: z.number().int().min(1).max(100).optional(),
      after: z.string().optional(),
    },
    (a) => ({
      method: "GET",
      path: `/channels/${a.channel_id}/messages/${a.message_id}/reactions/${encodeURIComponent(a.emoji)}${qs({ limit: a.limit, after: a.after })}`,
    }),
  );

  // ===================== Threads =====================
  defineTool(server, "discord_start_thread_from_message",
    "Start a thread on an existing message.",
    {
      channel_id: z.string().min(1),
      message_id: z.string().min(1),
      name: z.string().min(1).max(100),
      auto_archive_duration: z.number().int().optional(),
      rate_limit_per_user: z.number().int().nullable().optional(),
    },
    (a) => {
      const { channel_id, message_id, ...body } = a;
      return { method: "POST", path: `/channels/${channel_id}/messages/${message_id}/threads`, body };
    },
  );

  defineTool(server, "discord_start_thread",
    "Start a thread in a channel. type: 10=announcement, 11=public, 12=private.",
    {
      channel_id: z.string().min(1),
      name: z.string().min(1).max(100),
      type: z.number().int().optional(),
      auto_archive_duration: z.number().int().optional(),
      invitable: z.boolean().optional(),
      rate_limit_per_user: z.number().int().nullable().optional(),
    },
    (a) => {
      const { channel_id, ...body } = a;
      return { method: "POST", path: `/channels/${channel_id}/threads`, body };
    },
  );

  defineTool(server, "discord_list_active_threads",
    "List active (non-archived) threads in a channel.",
    { channel_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/channels/${a.channel_id}/threads/active` }),
  );

  defineTool(server, "discord_list_archived_threads",
    "List archived threads. type: 'public' (default) or 'private'.",
    {
      channel_id: z.string().min(1),
      type: z.enum(["public", "private"]).optional(),
      before: z.string().optional(),
      limit: z.number().int().min(1).max(100).optional(),
    },
    (a) => ({
      method: "GET",
      path: `/channels/${a.channel_id}/threads/archived/${a.type ?? "public"}${qs({ before: a.before, limit: a.limit })}`,
    }),
  );

  defineTool(server, "discord_join_thread",
    "Join a thread.",
    { channel_id: z.string().min(1) },
    (a) => ({ method: "PUT", path: `/channels/${a.channel_id}/thread-members/@me` }),
  );

  defineTool(server, "discord_leave_thread",
    "Leave a thread.",
    { channel_id: z.string().min(1) },
    (a) => ({ method: "DELETE", path: `/channels/${a.channel_id}/thread-members/@me` }),
  );

  defineTool(server, "discord_add_thread_member",
    "Add a user to a thread.",
    { channel_id: z.string().min(1), user_id: z.string().min(1) },
    (a) => ({ method: "PUT", path: `/channels/${a.channel_id}/thread-members/${a.user_id}` }),
  );

  defineTool(server, "discord_remove_thread_member",
    "Remove a user from a thread.",
    { channel_id: z.string().min(1), user_id: z.string().min(1) },
    (a) => ({ method: "DELETE", path: `/channels/${a.channel_id}/thread-members/${a.user_id}` }),
  );

  defineTool(server, "discord_list_thread_members",
    "List members of a thread.",
    { channel_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/channels/${a.channel_id}/thread-members` }),
  );

  defineTool(server, "discord_get_thread_member",
    "Get a thread member.",
    { channel_id: z.string().min(1), user_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/channels/${a.channel_id}/thread-members/${a.user_id}` }),
  );

  // ===================== Webhooks =====================
  defineTool(server, "discord_list_channel_webhooks",
    "List webhooks in a channel.",
    { channel_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/channels/${a.channel_id}/webhooks` }),
  );

  defineTool(server, "discord_get_webhook",
    "Get a webhook by ID.",
    { webhook_id: z.string().min(1) },
    (a) => ({ method: "GET", path: `/webhooks/${a.webhook_id}` }),
  );

  defineTool(server, "discord_create_webhook",
    "Create a webhook in a channel. `reason` shows in the audit log.",
    {
      channel_id: z.string().min(1),
      name: z.string().min(1).max(80),
      avatar: z.string().nullable().optional(),
      reason: reasonSchema,
    },
    (a) => {
      const { channel_id, reason, ...body } = a;
      return { method: "POST", path: `/channels/${channel_id}/webhooks`, body, reason };
    },
  );

  defineTool(server, "discord_modify_webhook",
    "Modify a webhook. `reason` shows in the audit log.",
    {
      webhook_id: z.string().min(1),
      name: z.string().max(80).optional(),
      avatar: z.string().nullable().optional(),
      channel_id: z.string().optional(),
      reason: reasonSchema,
    },
    (a) => {
      const { webhook_id, reason, ...body } = a;
      return { method: "PATCH", path: `/webhooks/${webhook_id}`, body, reason };
    },
  );

  defineTool(server, "discord_delete_webhook",
    "Delete a webhook. `reason` shows in the audit log.",
    { webhook_id: z.string().min(1), reason: reasonSchema },
    (a) => ({ method: "DELETE", path: `/webhooks/${a.webhook_id}`, reason: a.reason }),
  );

  defineTool(server, "discord_execute_webhook",
    "Execute a webhook (send a message through it). Uses the token from the webhook URL.",
    {
      webhook_id: z.string().min(1),
      webhook_token: z.string().min(1),
      content: z.string().max(2000).optional(),
      username: z.string().optional(),
      avatar_url: z.string().optional(),
      tts: z.boolean().optional(),
      embeds: z.array(embed).max(10).optional(),
      allowed_mentions: z.record(z.string(), z.unknown()).optional(),
      thread_name: z.string().optional(),
      wait: z.boolean().optional(),
    },
    (a) => {
      const { webhook_id, webhook_token, ...body } = a;
      return {
        method: "POST",
        path: `/webhooks/${webhook_id}/${webhook_token}${qs({ wait: a.wait })}`,
        body,
      };
    },
  );


  // ===================== Audit log =====================
  server.registerTool(
    "discord_get_audit_log",
    {
      description:
        "Read a guild's audit log (newest first). Every moderation and config action — kicks, bans, role edits, channel create/delete, message deletes, webhook changes, scheduled events — with the actor, target, reason, and diff. Use this to verify a previous write actually landed. Requires VIEW_AUDIT_LOG permission (bot must be admin). Common action_type values: 10=CHANNEL_CREATE, 12=CHANNEL_DELETE, 20=MEMBER_KICK, 22=MEMBER_BAN_ADD, 23=MEMBER_BAN_REMOVE, 25=MEMBER_ROLE_UPDATE, 30=ROLE_CREATE, 32=ROLE_DELETE, 50=WEBHOOK_CREATE, 52=WEBHOOK_DELETE, 72=MESSAGE_DELETE, 73=MESSAGE_BULK_DELETE, 121=GUILD_SCHEDULED_EVENT_CREATE.",
      inputSchema: {
        guild_id: z.string().min(1),
        user_id: z.string().optional().describe("Filter to actions performed by this user or bot ID"),
        action_type: z.number().int().optional().describe("Filter by Discord audit action_type integer"),
        before: z.string().optional().describe("Only entries before this entry ID"),
        after: z.string().optional().describe("Only entries after this entry ID"),
        limit: z.number().int().min(1).max(100).optional(),
        bot_only: z.boolean().optional().describe("Convenience: resolve the bot's own user ID and filter to its actions"),
        raw: z.boolean().optional().describe("Return the full audit log payload"),
      },
    },
    async ({ guild_id, user_id, action_type, before, after, limit, bot_only, raw }) => {
      try {
        let uid = user_id;
        if (bot_only) {
          const me = await discordFetch<{ id: string }>("/users/@me");
          uid = me.id;
        }
        const path = `/guilds/${guild_id}/audit-logs${qs({
          user_id: uid,
          action_type,
          before,
          after,
          limit,
        })}`;
        const data = await discordFetch<{
          audit_log_entries: any[];
          users: any[];
        }>(path);

        if (raw) return ok(JSON.stringify(data));

        const users = Object.fromEntries(
          (data.users ?? []).map((u) => [u.id, u]),
        );
        const entries = data.audit_log_entries ?? [];
        if (entries.length === 0) return ok("No audit log entries match.");

        return ok(entries.map((e) => fmtAuditEntry(e, users)).join("\n"));
      } catch (e) {
        return err(`discord_get_audit_log: ${msg(e)}`);
      }
    },
  );

  // ===================== Escape hatch =====================
  defineTool(server, "discord_request",
    "Raw Discord REST call for anything not covered by a named tool. path is relative to /api/v10 (e.g. '/guilds/123/voice-states'). `reason` sets X-Audit-Log-Reason.",
    {
      method: z.enum(["GET", "POST", "PATCH", "PUT", "DELETE"]),
      path: z.string().min(1),
      body: z.unknown().optional(),
      reason: reasonSchema,
    },
    (a) => ({ method: a.method, path: a.path, body: a.body, reason: a.reason }),
  );
}
