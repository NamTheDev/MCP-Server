import { openDb } from "../utils/db";

const AUTH_DB_PATH =
  process.env.AUTH_DB_PATH ?? `${import.meta.dir}/auth.db`;

const adb = openDb(AUTH_DB_PATH, { journalMode: "WAL" });

adb.exec(`
  CREATE TABLE IF NOT EXISTS discord_users (
    user_id      TEXT PRIMARY KEY,
    username     TEXT,
    status       TEXT NOT NULL DEFAULT 'pending',
    scopes       TEXT NOT NULL DEFAULT '[]',
    verified_at  INTEGER,
    last_seen_at INTEGER
  );

  CREATE TABLE IF NOT EXISTS discord_verification_requests (
    id           TEXT PRIMARY KEY,
    user_id      TEXT NOT NULL,
    tool         TEXT NOT NULL,
    args_json    TEXT NOT NULL,
    risk         TEXT NOT NULL,
    scope        TEXT NOT NULL,
    summary      TEXT NOT NULL,
    status       TEXT NOT NULL DEFAULT 'pending',
    created_at   INTEGER NOT NULL,
    expires_at   INTEGER NOT NULL,
    message_id   TEXT,
    channel_id   TEXT,
    resolved_at  INTEGER,
    resolved_by  TEXT
  );

  CREATE INDEX IF NOT EXISTS idx_vr_pending
    ON discord_verification_requests(user_id, status);

  CREATE TABLE IF NOT EXISTS discord_audit (
    id         INTEGER PRIMARY KEY AUTOINCREMENT,
    ts         INTEGER NOT NULL,
    user_id    TEXT,
    tool       TEXT NOT NULL,
    args_json  TEXT NOT NULL,
    decision   TEXT NOT NULL,
    risk       TEXT NOT NULL,
    request_id TEXT,
    result     TEXT
  );
`);

// Pending requests from the previous process are dead on restart.
adb
  .prepare(
    "UPDATE discord_verification_requests SET status='expired', resolved_at=?1 WHERE status='pending'",
  )
  .run(Date.now());

export type UserRow = {
  user_id: string;
  username: string | null;
  status: string;
  scopes: string;
  verified_at: number | null;
  last_seen_at: number | null;
};

type VerificationRow = {
  id: string;
  user_id: string;
  tool: string;
  args_json: string;
  risk: string;
  scope: string;
  summary: string;
  status: string;
  created_at: number;
  expires_at: number;
  message_id: string | null;
  channel_id: string | null;
  resolved_at: number | null;
  resolved_by: string | null;
};

export const astatements = {
  getUser: adb.prepare<UserRow, [string]>(
    "SELECT * FROM discord_users WHERE user_id = ?1",
  ),
  upsertUser: adb.prepare<UserRow, [string, string, string, number]>(
    `INSERT INTO discord_users (user_id, username, status, scopes, last_seen_at, verified_at)
     VALUES (?1, ?2, 'verified', ?3, ?4, ?4)
     ON CONFLICT(user_id) DO UPDATE SET
       username = excluded.username,
       last_seen_at = excluded.last_seen_at
     RETURNING *`,
  ),
  touchUser: adb.prepare<null, [number, string]>(
    "UPDATE discord_users SET last_seen_at = ?1 WHERE user_id = ?2",
  ),
  revokeUser: adb.prepare<null, [string]>(
    "UPDATE discord_users SET status = 'revoked' WHERE user_id = ?1",
  ),
  listUsers: adb.prepare<UserRow, []>(
    "SELECT * FROM discord_users ORDER BY verified_at ASC",
  ),

  insertRequest: adb.prepare<
    VerificationRow,
    [string, string, string, string, string, string, string, number, number]
  >(
    `INSERT INTO discord_verification_requests
       (id, user_id, tool, args_json, risk, scope, summary, created_at, expires_at)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8, ?9)
     RETURNING *`,
  ),
  getRequest: adb.prepare<VerificationRow, [string]>(
    "SELECT * FROM discord_verification_requests WHERE id = ?1",
  ),
  attachRequestMessage: adb.prepare<null, [string, string, string]>(
    "UPDATE discord_verification_requests SET message_id = ?1, channel_id = ?2 WHERE id = ?3",
  ),
  resolveRequest: adb.prepare<VerificationRow, [string, number, string, string]>(
    `UPDATE discord_verification_requests
       SET status = ?1, resolved_at = ?2, resolved_by = ?3
     WHERE id = ?4 AND status = 'pending'
     RETURNING *`,
  ),
  countPendingFor: adb.prepare<{ n: number }, [string, number]>(
    "SELECT COUNT(*) AS n FROM discord_verification_requests WHERE user_id = ?1 AND status = 'pending' AND expires_at > ?2",
  ),

  audit: adb.prepare<
    null,
    [number, string | null, string, string, string, string, string | null, string | null]
  >(
    `INSERT INTO discord_audit
       (ts, user_id, tool, args_json, decision, risk, request_id, result)
     VALUES (?1, ?2, ?3, ?4, ?5, ?6, ?7, ?8)`,
  ),
};
