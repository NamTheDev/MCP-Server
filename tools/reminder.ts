import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { REMINDER } from "../config/limits";
import { statements } from "../database/reminder-db";
import { err, ok } from "../utils/mcp";
import { fmt, humanDelta, parseWhen } from "../utils/time";

const emailSchema = z.string().email();

export function registerReminderTools(server: McpServer): void {
  server.registerTool(
    "add_reminder",
    {
      description:
        "Save a future reminder. `when` is parsed server-side (relative or absolute). " +
        "`email` is required — the address is notified when the reminder is due.",
      inputSchema: {
        text: z.string().min(1),
        when: z.string().min(1),
        email: emailSchema,
      },
    },
    async ({ text, when, email }) => {
      const d = parseWhen(when);
      if (!d) return err(`Couldn't parse time: "${when}".`);
      if (d.getTime() <= Date.now()) return err("That time is in the past.");
      const row = statements.insert.get(text, d.getTime(), Date.now(), email);
      if (!row) return err("Failed to save reminder.");
      return ok(
        `Reminder #${row.id}: "${row.text}" due ${fmt(row.due_at)} (${humanDelta(
          row.due_at - Date.now(),
        )}) — email: ${row.email}.`,
      );
    },
  );

  server.registerTool(
    "list_reminders",
    {
      description: "List reminders, soonest first.",
      inputSchema: {
        include_past: z.boolean().optional(),
        limit: z.number().int().min(1).max(REMINDER.maxLimit).optional(),
      },
    },
    async ({ include_past, limit }) => {
      const lim = limit ?? REMINDER.defaultLimit;
      const rows = include_past
        ? statements.listAll.all(lim)
        : statements.listUpcoming.all(Date.now(), lim);
      if (rows.length === 0) {
        return ok(include_past ? "No reminders." : "No upcoming reminders.");
      }
      return ok(
        rows
          .map((r) => {
            const delta = humanDelta(r.due_at - Date.now());
            return `#${r.id} — ${r.text} — ${fmt(r.due_at)} (${delta}) — email: ${r.email}`;
          })
          .join("\n"),
      );
    },
  );

  server.registerTool(
    "update_reminder",
    {
      description:
        "Edit a reminder's text, due time, and email. `email` is required, so " +
        "always pass the address to keep (or a new one to switch to).",
      inputSchema: {
        id: z.number().int().positive(),
        text: z.string().min(1).optional(),
        when: z.string().min(1).optional(),
        email: emailSchema,
      },
    },
    async ({ id, text, when, email }) => {
      const row = statements.get.get(id);
      if (!row) return err(`No reminder #${id}.`);
      let due = row.due_at;
      if (when !== undefined) {
        const d = parseWhen(when);
        if (!d) return err(`Couldn't parse time: "${when}".`);
        if (d.getTime() <= Date.now()) return err("That time is in the past.");
        due = d.getTime();
      }
      const next = statements.update.get(text ?? row.text, due, email, id);
      if (!next) return err("Update failed.");
      return ok(
        `Reminder #${id} updated: "${next.text}" due ${fmt(next.due_at)} (${humanDelta(
          next.due_at - Date.now(),
        )}) — email: ${next.email}.`,
      );
    },
  );

  server.registerTool(
    "delete_reminder",
    {
      description: "Remove a reminder by id.",
      inputSchema: { id: z.number().int().positive() },
    },
    async ({ id }) => {
      const row = statements.get.get(id);
      if (!row) return err(`No reminder #${id}.`);
      statements.remove.run(id);
      return ok(`Removed reminder #${id}.`);
    },
  );

  server.registerTool(
    "get_current_time",
    {
      description: "Return the current local time and ISO 8601.",
      inputSchema: {},
    },
    async () => {
      const now = new Date();
      return ok(`Local: ${now.toString()}\nISO: ${now.toISOString()}`);
    },
  );
}
