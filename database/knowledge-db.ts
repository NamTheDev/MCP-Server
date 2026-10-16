import { KNOWLEDGE_DB_PATH } from "../config/database";
import { openDb } from "../utils/db";


export const kdb = openDb(KNOWLEDGE_DB_PATH, {
  journalMode: "WAL",
  foreignKeys: true,
});

kdb.exec(`
  CREATE TABLE IF NOT EXISTS knowledge (
    id          INTEGER PRIMARY KEY AUTOINCREMENT,
    name        TEXT NOT NULL UNIQUE,
    description TEXT NOT NULL,
    tags        TEXT NOT NULL DEFAULT '[]',
    created_at  INTEGER NOT NULL
  );
  CREATE TABLE IF NOT EXISTS knowledge_sections (
    id           INTEGER PRIMARY KEY AUTOINCREMENT,
    knowledge_id INTEGER NOT NULL REFERENCES knowledge(id) ON DELETE CASCADE,
    position     INTEGER NOT NULL,
    title        TEXT    NOT NULL,
    description  TEXT    NOT NULL,
    content      TEXT    NOT NULL,
    UNIQUE(knowledge_id, title)
  );
  CREATE INDEX IF NOT EXISTS idx_sections_owner
    ON knowledge_sections(knowledge_id, position);
`);

export type KnowledgeRow = {
  id: number;
  name: string;
  description: string;
  tags: string;
  created_at: number;
};

type SectionRow = {
  id: number;
  knowledge_id: number;
  position: number;
  title: string;
  description: string;
  content: string;
};

export const kstatements = {
  getKnowledge: kdb.prepare<KnowledgeRow, [string]>(
    "SELECT * FROM knowledge WHERE name = ?1",
  ),
  listKnowledge: kdb.prepare<KnowledgeRow, []>(
    "SELECT * FROM knowledge ORDER BY created_at ASC",
  ),
  insertKnowledge: kdb.prepare<KnowledgeRow, [string, string, string, number]>(
    "INSERT INTO knowledge (name, description, tags, created_at) VALUES (?1, ?2, ?3, ?4) RETURNING *",
  ),
  updateKnowledge: kdb.prepare<KnowledgeRow, [string, string, string, string]>(
    "UPDATE knowledge SET name = ?1, description = ?2, tags = ?3 WHERE name = ?4 RETURNING *",
  ),
  removeKnowledge: kdb.prepare<null, [string]>(
    "DELETE FROM knowledge WHERE name = ?1",
  ),

  listSections: kdb.prepare<SectionRow, [number]>(
    "SELECT * FROM knowledge_sections WHERE knowledge_id = ?1 ORDER BY position ASC",
  ),
  getSection: kdb.prepare<SectionRow, [number, string]>(
    "SELECT * FROM knowledge_sections WHERE knowledge_id = ?1 AND title = ?2",
  ),
  insertSection: kdb.prepare<
    SectionRow,
    [number, number, string, string, string]
  >(
    "INSERT INTO knowledge_sections (knowledge_id, position, title, description, content) VALUES (?1, ?2, ?3, ?4, ?5) RETURNING *",
  ),
  updateSection: kdb.prepare<SectionRow, [string, string, string, number]>(
    "UPDATE knowledge_sections SET title = ?1, description = ?2, content = ?3 WHERE id = ?4 RETURNING *",
  ),
  removeSection: kdb.prepare<null, [number]>(
    "DELETE FROM knowledge_sections WHERE id = ?1",
  ),
  nextPosition: kdb.prepare<{ next: number | null }, [number]>(
    "SELECT MAX(position) + 1 AS next FROM knowledge_sections WHERE knowledge_id = ?1",
  ),
  search: kdb.prepare<{ name: string }, [string]>(
    `SELECT DISTINCT k.name AS name
   FROM knowledge k
   LEFT JOIN knowledge_sections s ON s.knowledge_id = k.id
  WHERE instr(lower(k.name),        lower(?1)) > 0
     OR instr(lower(k.description), lower(?1)) > 0
     OR instr(lower(s.title),       lower(?1)) > 0
     OR instr(lower(s.content),     lower(?1)) > 0
  ORDER BY k.name ASC`,
  ),
};
