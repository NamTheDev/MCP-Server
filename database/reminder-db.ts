import { REMINDER_DB_PATH } from "../config/database";
import { openDb } from "../utils/db";

export { REMINDER_DB_PATH };

export const db = openDb(REMINDER_DB_PATH, { journalMode: "WAL" });

db.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    text       TEXT    NOT NULL,
    due_at     INTEGER NOT NULL,
    created_at INTEGER NOT NULL,
    email      TEXT    NOT NULL
  );
  CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at);
`);

// Migration for databases created before the `email` column existed.
// NOT NULL + DEFAULT '' lets ALTER TABLE succeed on a non-empty table;
// every insert path now supplies a real address.
const cols = db
  .prepare("PRAGMA table_info(reminders)")
  .all() as Array<{ name: string }>;
if (!cols.some((c) => c.name === "email")) {
  db.exec("ALTER TABLE reminders ADD COLUMN email TEXT NOT NULL DEFAULT '';");
}

export type ReminderRow = {
  id: number;
  text: string;
  due_at: number;
  created_at: number;
  email: string;
};

export const statements = {
  insert: db.prepare<ReminderRow, [string, number, number, string]>(
    "INSERT INTO reminders (text, due_at, created_at, email) VALUES (?1, ?2, ?3, ?4) RETURNING *",
  ),
  listUpcoming: db.prepare<ReminderRow, [number, number]>(
    "SELECT * FROM reminders WHERE due_at >= ?1 ORDER BY due_at ASC LIMIT ?2",
  ),
  listAll: db.prepare<ReminderRow, [number]>(
    "SELECT * FROM reminders ORDER BY due_at ASC LIMIT ?1",
  ),
  get: db.prepare<ReminderRow, [number]>(
    "SELECT * FROM reminders WHERE id = ?1",
  ),
  remove: db.prepare<null, [number]>("DELETE FROM reminders WHERE id = ?1"),
  update: db.prepare<ReminderRow, [string, number, string, number]>(
    "UPDATE reminders SET text = ?1, due_at = ?2, email = ?3 WHERE id = ?4 RETURNING *",
  ),
};
