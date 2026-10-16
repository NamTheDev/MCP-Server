import { REMINDER_DB_PATH } from "../config/database";
import { openDb } from "../utils/db";

export { REMINDER_DB_PATH };

export const db = openDb(REMINDER_DB_PATH, { journalMode: "WAL" });

db.exec(`
  CREATE TABLE IF NOT EXISTS reminders (
    id              INTEGER PRIMARY KEY AUTOINCREMENT,
    text            TEXT    NOT NULL,
    due_at          INTEGER NOT NULL,
    created_at      INTEGER NOT NULL,
    discord_user_id TEXT    NOT NULL,
    sent_at         INTEGER,
    send_attempts   INTEGER NOT NULL DEFAULT 0
  );
`);

const colsOf = (): string[] =>
  (
    db.prepare("PRAGMA table_info(reminders)").all() as Array<{ name: string }>
  ).map((c) => c.name);

// If the table still has the old `email` column, replace it wholesale with
// the Discord schema. Rows written under the email era can no longer be
// delivered, so they are preserved but marked sent (the scheduler skips them).
if (colsOf().includes("email")) {
  const now = Date.now();
  db.transaction(() => {
    db.exec("ALTER TABLE reminders RENAME TO reminders_old");
    db.exec(`
      CREATE TABLE reminders (
        id              INTEGER PRIMARY KEY AUTOINCREMENT,
        text            TEXT    NOT NULL,
        due_at          INTEGER NOT NULL,
        created_at      INTEGER NOT NULL,
        discord_user_id TEXT    NOT NULL,
        sent_at         INTEGER,
        send_attempts   INTEGER NOT NULL DEFAULT 0
      );
    `);
    db.prepare(
      `INSERT INTO reminders
         (id, text, due_at, created_at, discord_user_id, sent_at, send_attempts)
       SELECT id, text, due_at, created_at, '', ?1, 0 FROM reminders_old`,
    ).run(now);
    db.exec("DROP TABLE reminders_old");
  })();
}

// Add columns missing from partial installs.
for (const [col, ddl] of [
  ["sent_at", "ALTER TABLE reminders ADD COLUMN sent_at INTEGER"],
  [
    "send_attempts",
    "ALTER TABLE reminders ADD COLUMN send_attempts INTEGER NOT NULL DEFAULT 0",
  ],
] as const) {
  if (!colsOf().includes(col)) db.exec(ddl);
}

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_reminders_due_at ON reminders(due_at);
  CREATE INDEX IF NOT EXISTS idx_reminders_pending ON reminders(sent_at, due_at);
`);

export type ReminderRow = {
  id: number;
  text: string;
  due_at: number;
  created_at: number;
  discord_user_id: string;
  sent_at: number | null;
  send_attempts: number;
};

export const statements = {
  insert: db.prepare<ReminderRow, [string, number, number, string]>(
    "INSERT INTO reminders (text, due_at, created_at, discord_user_id) VALUES (?1, ?2, ?3, ?4) RETURNING *",
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
  update: db.prepare<
    ReminderRow,
    [string, number, string, number | null, number]
  >(
    "UPDATE reminders SET text = ?1, due_at = ?2, discord_user_id = ?3, sent_at = ?4 WHERE id = ?5 RETURNING *",
  ),

  // ---- used by the delivery scheduler ----
  listDue: db.prepare<ReminderRow, [number, number]>(
    `SELECT * FROM reminders
      WHERE due_at <= ?1
        AND sent_at IS NULL
        AND discord_user_id != ''
        AND send_attempts < 3
      ORDER BY due_at ASC
      LIMIT ?2`,
  ),
  markSent: db.prepare<null, [number, number]>(
    "UPDATE reminders SET sent_at = ?1, send_attempts = send_attempts + 1 WHERE id = ?2",
  ),
  bumpAttempts: db.prepare<null, [number]>(
    "UPDATE reminders SET send_attempts = send_attempts + 1 WHERE id = ?1",
  ),
};
