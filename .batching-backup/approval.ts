import { randomUUID } from "node:crypto";
import {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  EmbedBuilder,
} from "discord.js";
import { AUTH, type Scope } from "../config/auth";
import type { Risk } from "../config/policy";
import { astatements, type UserRow } from "../database/auth-db";
import type { CallShape, GuardResult } from "./auth";
import { audit } from "./audit";
import { discordFetch } from "./discord";

type Pending = {
  resolve: (approved: boolean) => void;
  timer: ReturnType<typeof setTimeout>;
};

const pending = new Map<string, Pending>();
const MAX_PENDING_PER_USER = 3;

export async function requestApproval(
  user: UserRow,
  tool: string,
  args: Record<string, unknown>,
  call: CallShape,
  policy: { risk: Risk; scope: Scope },
): Promise<GuardResult> {
  if (!AUTH.verifyEnabled) {
    audit(user.user_id, tool, args, "denied", policy.risk, null, "gateway disabled");
    return {
      ok: false,
      reason:
        "Approval gateway is disabled (DISCORD_VERIFY_ENABLED != 1). High/critical actions are blocked.",
    };
  }

  const now = Date.now();
  const pendingCount =
    astatements.countPendingFor.get(user.user_id, now)?.n ?? 0;
  if (pendingCount >= MAX_PENDING_PER_USER) {
    audit(user.user_id, tool, args, "denied", policy.risk, null, "too many pending");
    return {
      ok: false,
      reason: "Too many pending approval requests. Resolve or wait for expiry.",
    };
  }

  const id = randomUUID();
  const summary = formatActionSummary(tool, call);
  const expiresAt = now + AUTH.approvalTimeoutMs;

  const row = astatements.insertRequest.get(
    id,
    user.user_id,
    tool,
    JSON.stringify(args).slice(0, 4000),
    policy.risk,
    policy.scope,
    summary,
    now,
    expiresAt,
  );
  if (!row) return { ok: false, reason: "Failed to create approval request." };

  // Send the DM with buttons.
  try {
    const embed = new EmbedBuilder()
      .setTitle("Approval required")
      .setDescription(summary)
      .addFields(
        { name: "Tool", value: `\`${tool}\``, inline: true },
        { name: "Risk", value: policy.risk, inline: true },
        { name: "Scope", value: policy.scope, inline: true },
      )
      .setFooter({ text: `Request ${id}` })
      .setTimestamp(now);

    const approve = new ButtonBuilder()
      .setCustomId(`mcp:approve:${id}`)
      .setLabel("Approve")
      .setStyle(ButtonStyle.Success);
    const deny = new ButtonBuilder()
      .setCustomId(`mcp:deny:${id}`)
      .setLabel("Deny")
      .setStyle(ButtonStyle.Danger);

    const rows: ActionRowBuilder<ButtonBuilder>[] = [
      new ActionRowBuilder<ButtonBuilder>().addComponents(approve, deny),
    ];
    if (policy.risk === "medium") {
      const allow15 = new ButtonBuilder()
        .setCustomId(`mcp:allow15:${id}`)
        .setLabel("Allow 15 min")
        .setStyle(ButtonStyle.Primary);
      rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(allow15));
    }

    const channel = await discordFetch<{ id: string }>("/users/@me/channels", {
      method: "POST",
      body: JSON.stringify({ recipient_id: user.user_id }),
    });
    const message = await discordFetch<{ id: string }>(
      `/channels/${channel.id}/messages`,
      {
        method: "POST",
        body: JSON.stringify({
          embeds: [embed.toJSON()],
          components: rows.map((r) => r.toJSON()),
        }),
      },
    );
    astatements.attachRequestMessage.run(message.id, channel.id, id);
  } catch (e) {
    audit(
      user.user_id,
      tool,
      args,
      "denied",
      policy.risk,
      id,
      `DM failed: ${String(e)}`,
    );
    return { ok: false, reason: `Failed to send approval DM: ${String(e)}` };
  }

  // Wait for a decision or timeout.
  const approved = await new Promise<boolean>((resolve) => {
    const timer = setTimeout(() => {
      pending.delete(id);
      resolve(false);
    }, AUTH.approvalTimeoutMs);
    pending.set(id, { resolve, timer });
  });

  const final = astatements.getRequest.get(id);
  const status = final?.status ?? "expired";

  if (approved && status === "approved") {
    audit(user.user_id, tool, args, "approved", policy.risk, id, null);
    return { ok: true, user, auto: false, viaSession: false };
  }

  if (status === "pending") {
    astatements.resolveRequest.run("expired", Date.now(), "system", id);
  }
  audit(user.user_id, tool, args, status, policy.risk, id, null);
  return {
    ok: false,
    reason:
      status === "denied"
        ? "Request denied by user."
        : "Approval request expired or was not approved.",
  };
}

/**
 * Called by the Discord gateway when a button is clicked.
 * Returns true if the interaction was a valid decision on a pending request.
 */
export function resolveApproval(
  id: string,
  decision: "approved" | "denied" | "allow15",
  byUserId: string,
): boolean {
  const req = astatements.getRequest.get(id);
  if (!req) return false;
  if (req.status !== "pending") return false;
  if (req.expires_at < Date.now()) {
    astatements.resolveRequest.run("expired", Date.now(), "system", id);
    const p = pending.get(id);
    p?.resolve(false);
    pending.delete(id);
    return false;
  }
  if (req.user_id !== byUserId) return false;

  if (decision === "allow15") {
    const token = randomUUID();
    astatements.insertSession.get(
      token,
      req.user_id,
      req.tool,
      req.scope,
      Date.now(),
      Date.now() + AUTH.sessionTtlMs,
      50,
    );
    astatements.resolveRequest.run("approved", Date.now(), byUserId, id);
    pending.get(id)?.resolve(true);
    pending.delete(id);
    return true;
  }

  astatements.resolveRequest.run(decision, Date.now(), byUserId, id);
  pending.get(id)?.resolve(decision === "approved");
  pending.delete(id);
  return true;
}

function formatActionSummary(tool: string, call: CallShape): string {
  const m = call.method;
  const p = call.path;
  const b = call.body ? JSON.stringify(call.body).slice(0, 200) : "";
  const parts = p.split("/").filter(Boolean);

  switch (tool) {
    case "discord_delete_channel":
      return `Delete channel \`${parts[parts.length - 1]}\``;
    case "discord_delete_guild_role":
      return `Delete role \`${parts[parts.length - 1]}\` in guild \`${parts[1]}\``;
    case "discord_send_message": {
      const channelId = parts[1] ?? "?";
      return `Send message to channel \`${channelId}\`:\n${b}`;
    }
    case "discord_send_dm":
      return `Send DM:\n${b}`;
    case "discord_bulk_delete_messages":
      return `Bulk-delete messages in \`${parts[1]}\`:\n${b}`;
    case "discord_ban_guild_member":
    case "discord_unban_guild_member":
      return `Ban/unban user \`${parts[3]}\` in guild \`${parts[1]}\`:\n${b}`;
    case "discord_kick_guild_member":
      return `Kick user \`${parts[3]}\` from guild \`${parts[1]}\``;
    case "discord_request":
      return `Raw \`${m} ${p}\`\n${b}`;
    default:
      return `${m} \`${p}\`${b ? `\n${b}` : ""}`;
  }
}
