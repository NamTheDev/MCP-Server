import { resolve } from "node:path";

const DB_DIR = resolve(import.meta.dir, "..", "database");

export const KNOWLEDGE_DB_PATH =
  process.env.KNOWLEDGE_DB_PATH ?? resolve(DB_DIR, "knowledge.db");

export const REMINDER_DB_PATH =
  process.env.REMINDER_DB_PATH ?? resolve(DB_DIR, "reminders.db");
