import { readFileSync } from "node:fs";
import { resolve } from "node:path";

const pkg = JSON.parse(
  readFileSync(resolve(import.meta.dir, "..", "package.json"), "utf8"),
) as { version: string };

export const SERVER = {
  name: "assistant",
  version: pkg.version,
} as const;

export const HTTP = {
  host: process.env.MCP_HOST ?? "127.0.0.1",
  port: Number(process.env.MCP_PORT ?? 3737),
} as const;
