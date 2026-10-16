import { createHmac, timingSafeEqual } from "node:crypto";
import { AUTH, SCOPES, type Scope } from "../config/auth";
import { policyFor, type Risk, type ToolPolicy } from "../config/policy";
import { astatements, type UserRow } from "../database/auth-db";
import { requestApproval } from "./approval";
import { audit } from "./audit";
import { currentHeaders } from "./context";

export type CallShape = {
  method: string;
  path: string;
  body?: unknown;
  reason?: string;
};

export type GuardResult =
  | { ok: true; user: UserRow; auto: boolean; viaSession: boolean }
  | { ok: false; reason: string };

// ---------- identity ----------

type Identity = {
  userId: string;
  username?: string;
  verifiedVia: "local" | "signed";
};

function rawHeader(name: string): string | undefined {
  const v = currentHeaders()[name];
  return Array.isArray(v) ? v[0] : v;
}

function parseSignedHeaders(): Identity | null {
  if (!AUTH.secret) return null;
  const userId = rawHeader("x-discord-user-id");
  const ts = rawHeader("x-timestamp");
  const nonce = rawHeader("x-nonce");
  const sig = rawHeader("x-signature");
  if (!userId || !ts || !nonce || !sig) return null;

  const tsNum = Number(ts);
  if (!Number.isFinite(tsNum)) return null;
  if (Math.abs(Date.now() - tsNum) > 60_000) return null;

  const expected = createHmac("sha256", AUTH.secret)
    .update(`${userId}:${ts}:${nonce}`)
    .digest("hex");

  const a = Buffer.from(expected, "hex");
  const b = Buffer.from(sig, "hex");
  if (a.length !== b.length || !timingSafeEqual(a, b)) return null;

  return { userId, verifiedVia: "signed" };
}

export function resolveIdentity(): Identity | null {
  const signed = parseSignedHeaders();
  if (signed) return signed;
  if (AUTH.operatorId) return { userId: AUTH.operatorId, verifiedVia: "local" };
  return null;
}

// ---------- scopes ----------

export function parseScopes(raw: string): Scope[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as Scope[]) : [];
  } catch {
    return [];
  }
}

function hasScope(user: UserRow, need: Scope): boolean {
  const scopes = parseScopes(user.scopes);
  return scopes.includes("admin") || scopes.includes(need);
}

// ---------- main guard ----------

export async function guardDiscordTool(
  tool: string,
  args: Record<string, unknown>,
  call: CallShape,
): Promise<GuardResult> {
  const policy: ToolPolicy = policyFor(tool, call.method);

  // 1. Identity
  const id = resolveIdentity();
  if (!id) {
    return {
      ok: false,
      reason:
        "No requester identity. Set MCP_OPERATOR_ID for local use, or sign the request with MCP_AUTH_SECRET.",
    };
  }

  // 2. User record (auto-enrol the operator/allowlist on first use)
  let user = astatements.getUser.get(id.userId);
  if (!user) {
    if (AUTH.allowlist.includes(id.userId)) {
      const scopes: Scope[] = [...SCOPES];
      user =
        astatements.upsertUser.get(
          id.userId,
          id.username ?? "",
          JSON.stringify(scopes),
          Date.now(),
        ) ?? null;
    } else {
      return {
        ok: false,
        reason: `User ${id.userId} is not in DISCORD_ALLOWLIST.`,
      };
    }
  }
  if (!user) return { ok: false, reason: "Failed to load user record." };
  if (user.status !== "verified") {
    return { ok: false, reason: `User ${id.userId} is ${user.status}.` };
  }

  astatements.touchUser.run(Date.now(), id.userId);

  // 3. Scope
  if (!hasScope(user, policy.scope)) {
    audit(user.user_id, tool, args, "denied", policy.risk, null, "missing scope");
    return {
      ok: false,
      reason: `User ${id.userId} lacks scope "${policy.scope}".`,
    };
  }

  // 4. Low risk: pass
  if (policy.risk === "low") {
    audit(user.user_id, tool, args, "auto", policy.risk, null, null);
    return { ok: true, user, auto: true, viaSession: false };
  }

  // 5. Reuse a session for medium risk
  if (policy.risk === "medium") {
    const s = astatements.findSession.get(user.user_id, tool, Date.now());
    if (s) {
      astatements.consumeSession.run(s.token, Date.now(), tool);
      audit(user.user_id, tool, args, "auto", policy.risk, null, "session");
      return { ok: true, user, auto: true, viaSession: true };
    }
  }

  // 6. Everything else needs a button
  return await requestApproval(user, tool, args, call, policy);
}

// Re-export for convenience in tool call sites.
export type { Risk };
