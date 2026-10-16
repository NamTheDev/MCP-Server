import { astatements } from "../database/auth-db";

export function audit(
  userId: string | null,
  tool: string,
  args: unknown,
  decision: string,
  risk: string,
  requestId: string | null,
  result: string | null,
): void {
  try {
    astatements.audit.run(
      Date.now(),
      userId,
      tool,
      JSON.stringify(args).slice(0, 4000),
      decision,
      risk,
      requestId,
      result,
    );
  } catch {
    // Never fail the tool because audit failed.
  }
}
