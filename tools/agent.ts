import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { SKILLS, SKILLS_DIR } from "../config/skills";
import { msg } from "../utils/errors";
import { err, ok } from "../utils/mcp";

export function registerAgentTools(server: McpServer): void {
  server.registerTool(
    "list_skills",
    {
      description:
        "List available agent skills. Each skill is a guidance document for a tool group.",
      inputSchema: {},
    },
    async () => {
      const lines = Object.entries(SKILLS).map(
        ([name, s]) => `- ${name}: ${s.description}`,
      );
      return ok(`Available skills:\n${lines.join("\n")}`);
    },
  );

  server.registerTool(
    "get_skill",
    {
      description:
        "Fetch a skill's full guidance document by name. Call this before using the reminders or knowledge tools for the first time.",
      inputSchema: { name: z.string().min(1) },
    },
    async ({ name }) => {
      const skill = SKILLS[name];
      if (!skill) {
        return err(
          `Unknown skill "${name}". Available: ${Object.keys(SKILLS).join(", ")}.`,
        );
      }
      try {
        return ok(readFileSync(resolve(SKILLS_DIR, skill.file), "utf8"));
      } catch (e) {
        return err(
          `Failed to load skill "${name}": ${msg(e)}`,
        );
      }
    },
  );
}
