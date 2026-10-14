import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

const JOURNAL_MODES = [
  "DELETE", "TRUNCATE", "PERSIST", "MEMORY", "WAL", "OFF",
] as const;
export type JournalMode = (typeof JOURNAL_MODES)[number];

export type OpenDbOptions = {
  journalMode?: JournalMode;
  foreignKeys?: boolean;
};

export function openDb(path: string, opts: OpenDbOptions = {}): Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });

  const mode = opts.journalMode ?? "WAL";
  if (!JOURNAL_MODES.includes(mode)) {
    throw new Error(`invalid journal mode: ${mode}`);
  }
  db.exec(`PRAGMA journal_mode = ${mode};`);
  if (opts.foreignKeys) db.exec("PRAGMA foreign_keys = ON;");
  return db;
}
