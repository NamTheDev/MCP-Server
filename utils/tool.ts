import type { McpServer } from "@modelcontextprotocol/server";
import { msg } from "./errors";
import { err, ok } from "./mcp";
import type { CallShape, GuardResult } from "./auth";

export type ToolCaller = {
  guard: (
    name: string,
    args: Record<string, unknown>,
    call: CallShape,
  ) => Promise<GuardResult>;
  execute: (call: CallShape) => Promise<unknown>;
};

export function defineGuardedTool(
  server: McpServer,
  caller: ToolCaller,
  name: string,
  description: string,
  inputSchema: any,
  build: (a: any) => CallShape,
  format: (d: unknown, a: any) => string = (d) =>
    d === undefined ? "ok" : JSON.stringify(d),
): void {
  server.registerTool(
    name,
    { description, inputSchema },
    async (args: any) => {
      try {
        const call = build(args);
        const guard = await caller.guard(name, args, call);
        if (!guard.ok) return err(`${name}: ${guard.reason}`);
        const data = await caller.execute(call);
        return ok(format(data, args));
      } catch (e) {
        return err(`${name}: ${msg(e)}`);
      }
    },
  );
}
