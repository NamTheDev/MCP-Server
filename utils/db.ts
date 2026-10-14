import { Database } from "bun:sqlite";
import { mkdirSync } from "node:fs";
import { dirname } from "node:path";

export type OpenDbOptions = {
  journalMode?: string;
  foreignKeys?: boolean;
};

export function openDb(path: string, opts: OpenDbOptions = {}): Database {
  mkdirSync(dirname(path), { recursive: true });
  const db = new Database(path, { create: true });
  db.exec(`PRAGMA journal_mode = ${opts.journalMode ?? "WAL"};`);
  if (opts.foreignKeys) db.exec("PRAGMA foreign_keys = ON;");
  return db;
}
