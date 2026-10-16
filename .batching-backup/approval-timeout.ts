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

type BatchedCall = {
  args: Record<string, unknown>;
  call: CallShape;
  resolve: (approved: boolean) => void;
};

type PendingBatch = {
  id: string;
  user_id: string;
  tool: string;
  scope: Scope;
  risk: Risk;
  calls: BatchedCall[];
  channelId: string;
  messageId: string;
  expiresAt: number;
  timer: ReturnType<typeof setTimeout> | null;
  finished: boolean;
};

const pending = new Map<string, PendingBatch>();
const pendingKeyToId = new Map<string, string>();
const recentApprovals = new Map<string, number>();
const MAX_PENDING_PER_USER = 3;

const batchKey = (userId: string, tool: string) => `${userId}:${tool}`;

function markBatchApproved(userId: string, tool: string): void {
  if (AUTH.batchWindowMs <= 0) return;
  recentApprovals.set(batchKey(userId, tool), Date.now() + AUTH.batchWindowMs);
}

export function isBatchApproved(userId: string, tool: string): boolean {
  const key = batchKey(userId, tool);
  const exp = recentApprovals.get(key);
  if (exp === undefined) return false;
  if (exp < Date.now()) {
    recentApprovals.delete(key);
    return false;
  }
  return true;
}

function pushCall(
  batch: PendingBatch,
  args: Record<string, unknown>,
  call: CallShape,
): Promise<boolean> {
  return new Promise<boolean>((resolve) => {
    batch.calls.push({ args, call, resolve });
  });
}

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

  const key = batchKey(user.user_id, tool);
  const existingId = pendingKeyToId.get(key);
  const existing = existingId ? pending.get(existingId) : undefined;

  // --- join an in-flight batch ---
  if (existing && !existing.finished) {
    const promise = pushCall(existing, args, call);
    void refreshBatchMessage(existing).catch(() => {});
    const approved = await promise;
    if (approved) {
      audit(user.user_id, tool, args, "approved", policy.risk, existing.id, "batched");
      return { ok: true, user, auto: false, viaSession: false };
    }
    audit(user.user_id, tool, args, "denied", policy.risk, existing.id, "batched");
    return { ok: false, reason: "Request denied by user." };
  }

  // --- fresh batch ---
  const now = Date.now();
  const pendingCount = astatements.countPendingFor.get(user.user_id, now)?.n ?? 0;
  if (pendingCount >= MAX_PENDING_PER_USER) {
    audit(user.user_id, tool, args, "denied", policy.risk, null, "too many pending");
    return {
      ok: false,
      reason: "Too many pending approval requests. Resolve or wait for expiry.",
    };
  }

  const id = randomUUID();
  const expiresAt = now + AUTH.approvalTimeoutMs;
  const summary = formatActionSummary(tool, call);

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

  const batch: PendingBatch = {
    id,
    user_id: user.user_id,
    tool,
    scope: policy.scope,
    risk: policy.risk,
    calls: [],
    channelId: "",
    messageId: "",
    expiresAt,
    timer: null,
    finished: false,
  };

  // Reserve the slot *before* any await, so parallel calls find this batch.
  pending.set(id, batch);
  pendingKeyToId.set(key, id);

  // Queue the first call now, so the batch reflects it in the DM.
  const promise = pushCall(batch, args, call);

  // --- send the DM ---
  try {
    const { embed, rows } = buildApprovalUI(id, tool, policy, [call]);
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
    batch.channelId = channel.id;
    batch.messageId = message.id;
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
    finalizeBatch(batch, "expired", "system");
    return { ok: false, reason: `Failed to send approval DM: ${String(e)}` };
  }

  // If other calls joined while the DM was being sent, redraw the embed.
  if (batch.calls.length > 1) {
    void refreshBatchMessage(batch).catch(() => {});
  }

  batch.timer = setTimeout(() => {
    if (batch.finished) return;
    const label = finalizeBatch(batch, "expired", "system");
    void editMessage(batch.channelId, batch.messageId, label).catch((e) => {
      console.error(`[approval] timeout edit failed: ${String(e)}`);
    });
  }, AUTH.approvalTimeoutMs);

  const approved = await promise;
  if (approved) {
    audit(user.user_id, tool, args, "approved", policy.risk, id, null);
    return { ok: true, user, auto: false, viaSession: false };
  }

  const final = astatements.getRequest.get(id);
  const status = final?.status ?? "expired";
  audit(user.user_id, tool, args, status, policy.risk, id, null);
  return {
    ok: false,
    reason:
      status === "denied"
        ? "Request denied by user."
        : "Approval request expired or was not approved.",
  };
}

function finalizeBatch(
  batch: PendingBatch,
  status: "approved" | "denied" | "expired",
  byUserId: string,
): string {
  if (batch.finished) return statusLabel(status);
  batch.finished = true;
  if (batch.timer) clearTimeout(batch.timer);

  pending.delete(batch.id);
  pendingKeyToId.delete(batchKey(batch.user_id, batch.tool));

  astatements.resolveRequest.run(status, Date.now(), byUserId, batch.id);

  if (status === "approved") markBatchApproved(batch.user_id, batch.tool);

  for (const c of batch.calls) c.resolve(status === "approved");

  return statusLabel(status);
}

function statusLabel(status: "approved" | "denied" | "expired"): string {
  return status === "approved"
    ? "Approved ✓"
    : status === "denied"
      ? "Denied ✗"
      : "Request timed out";
}

async function editMessage(
  channelId: string,
  messageId: string,
  content: string,
): Promise<void> {
  if (!channelId || !messageId) return;
  await discordFetch(`/channels/${channelId}/messages/${messageId}`, {
    method: "PATCH",
    body: JSON.stringify({ content, embeds: [], components: [] }),
  });
}

/**
 * Called by the Discord gateway when a button is clicked.
 * Returns the label to show, or null if the interaction is invalid.
 */
export function resolveApproval(
  id: string,
  decision: "approved" | "denied" | "allow15",
  byUserId: string,
): string | null {
  const batch = pending.get(id);
  if (!batch || batch.finished) return null;
  if (batch.expiresAt < Date.now()) {
    const label = finalizeBatch(batch, "expired", "system");
    void editMessage(batch.channelId, batch.messageId, label).catch(() => {});
    return null;
  }
  if (batch.user_id !== byUserId) return null;

  if (decision === "allow15") {
    const token = randomUUID();
    astatements.insertSession.get(
      token,
      batch.user_id,
      batch.tool,
      batch.scope,
      Date.now(),
      Date.now() + AUTH.sessionTtlMs,
      50,
    );
    return finalizeBatch(batch, "approved", byUserId);
  }

  return finalizeBatch(
    batch,
    decision === "approved" ? "approved" : "denied",
    byUserId,
  );
}

async function refreshBatchMessage(batch: PendingBatch): Promise<void> {
  if (batch.finished) return;
  if (!batch.channelId || !batch.messageId) return;
  const { embed, rows } = buildApprovalUI(
    batch.id,
    batch.tool,
    { risk: batch.risk, scope: batch.scope },
    batch.calls.map((c) => c.call),
  );
  try {
    await discordFetch(
      `/channels/${batch.channelId}/messages/${batch.messageId}`,
      {
        method: "PATCH",
        body: JSON.stringify({
          embeds: [embed.toJSON()],
          components: rows.map((r) => r.toJSON()),
        }),
      },
    );
  } catch {
    // The batch continues; the DM just stays stale.
  }
}

function buildApprovalUI(
  id: string,
  tool: string,
  policy: { risk: Risk; scope: Scope },
  calls: CallShape[],
): { embed: EmbedBuilder; rows: ActionRowBuilder<ButtonBuilder>[] } {
  const count = calls.length;
  const first = calls[0];

  let description: string;
  if (count === 1 && first) {
    description = formatActionSummary(tool, first);
  } else {
    const preview = calls
      .slice(0, 5)
      .map((c, i) => `${i + 1}. ${formatActionSummary(tool, c)}`)
      .join("\n");
    const more = count > 5 ? `\n…and ${count - 5} more` : "";
    description = `${count} batched calls:\n${preview}${more}`;
  }

  const embed = new EmbedBuilder()
    .setTitle("Approval required")
    .setDescription(description.slice(0, 4000))
    .addFields(
      { name: "Tool", value: `\`${tool}\``, inline: true },
      { name: "Risk", value: policy.risk, inline: true },
      { name: "Calls", value: String(count), inline: true },
    )
    .setFooter({ text: `Request ${id}` })
    .setTimestamp(Date.now());

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
  if (policy.risk === "medium" && count === 1) {
    const allow15 = new ButtonBuilder()
      .setCustomId(`mcp:allow15:${id}`)
      .setLabel("Allow 15 min")
      .setStyle(ButtonStyle.Primary);
    rows.push(new ActionRowBuilder<ButtonBuilder>().addComponents(allow15));
  }

  return { embed, rows };
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
    case "discord_create_guild_channel":
      return `Create channel: ${b}`;
    case "discord_request":
      return `Raw \`${m} ${p}\`\n${b}`;
    default:
      return `${m} \`${p}\`${b ? `\n${b}` : ""}`;
  }
}
