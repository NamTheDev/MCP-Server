export const SCOPES = ["read", "write", "manage", "moderate", "admin"] as const;
export type Scope = (typeof SCOPES)[number];

export const AUTH = {
  /** Local operator ID (used when running from LM Studio on localhost). */
  operatorId: process.env.MCP_OPERATOR_ID ?? "",
  /** Static allowlist of user IDs that may be auto-verified on first sight. */
  allowlist: (process.env.DISCORD_ALLOWLIST ?? process.env.MCP_OPERATOR_ID ?? "")
    .split(",")
    .map((s) => s.trim())
    .filter(Boolean),
  /** HMAC secret for signed multi-tenant requests (future Discord-bot usage). */
  secret: process.env.MCP_AUTH_SECRET ?? "",
  /** Gate for the DM-button approval gateway. */
  verifyEnabled: process.env.DISCORD_VERIFY_ENABLED === "1",
  /** How long a pending approval button stays valid. */
  approvalTimeoutMs: Number(process.env.DISCORD_APPROVAL_TIMEOUT_MS ?? 60_000),
  /**
   * After a manual approval, calls of the same tool by the same user
   * auto-approve for this long. Handles sequential batches. Set to 0 to
   * disable.
   */
  batchWindowMs: Number(process.env.DISCORD_BATCH_WINDOW_MS ?? 15_000),
} as const;
