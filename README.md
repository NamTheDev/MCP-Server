# mcp-reminders `v1.0.0`

> Persistent knowledge & reminders for an MCP-powered agent.

An [MCP](https://modelcontextprotocol.io) server that gives an AI agent durable memory — 
a hierarchical **knowledge store** and a time-aware **reminder system**. Both are exposed 
as registered tools with Zod-validated schemas, persisted in SQLite (WAL mode), and 
documented for the model via markdown skill guides.

## Features

- **Knowledge store** — slug-keyed entries with description, tags, and ordered sections 
  (`title`, `description`, verbatim `content`). Full CRUD: store, list, search, read, 
  update metadata, rename, add/update/remove sections.
- **Reminders** — scheduled reminders with natural-language time parsing and CRUD.
- **Layered architecture** — tunables in `config/`, shared helpers in `utils/`, tools in `tools/`, persistence in `database/`.
- **SQLite persistence** — WAL journal mode, prepared statements, transactional writes.
- **Skill documents** — `skills/*.md` guides fetched by the agent before using each tool family.
- **MCP-native** — tools registered via `@modelcontextprotocol/server` with Zod v4 input schemas.

## Requirements

- [Bun](https://bun.sh) ≥ 1.1 — runtime, package manager, and test runner.
- No system SQLite needed; `bun:sqlite` is built in.

## Install

```bash
bun install
```

## Scripts

| Command | Runs |
|---|---|
| `bun run dev` | `bun --watch index.ts` |
| `bun run start` | `bun run index.ts` |
| `bun run typecheck` | `tsc --noEmit` |

## Project structure

```
MCP-Server/
├── config
│   ├── database.ts
│   ├── limits.ts
│   ├── server.ts
│   ├── skills.ts
│   └── time.ts
├── database
│   ├── knowledge-db.ts
│   └── reminder-db.ts
├── skills
│   ├── knowledge.md
│   └── reminder.md
├── tools
│   ├── agent.ts
│   ├── knowledge.ts
│   └── reminder.ts
├── utils
│   ├── db.ts
│   ├── errors.ts
│   ├── mcp.ts
│   ├── slug.ts
│   ├── tags.ts
│   └── time.ts
├── .gitignore
├── bun.lock
├── index.ts
├── package.json
├── README.md
├── script.sh
└── tsconfig.json
```

## Tools

Registered on the MCP server:

### `list_skills`

List available agent skills. Each skill is a guidance document for a tool group.

*Source: `tools/agent.ts:11`*

### `get_skill`

Fetch a skill's full guidance document by name. Call this before using the reminders or knowledge tools for the first time.

*Source: `tools/agent.ts:26`*

### `store_knowledge`

Save a knowledge entry. `name` and section titles are slugified.

*Source: `tools/knowledge.ts:19`*

### `list_knowledge`

List all knowledge entries (name, tags, description, section titles). Optional tag filter.

*Source: `tools/knowledge.ts:67`*

### `search_knowledge`

Substring search across entry names, descriptions, and section titles/content.

*Source: `tools/knowledge.ts:90`*

### `read_knowledge`

Without `section`: returns the entry's index (name + per-section description). With `section`: returns that section's markdown content.

*Source: `tools/knowledge.ts:111`*

### `update_knowledge`

Update an entry's description, tags, and/or name (via `new_name`). Sections are managed by add_section / update_section / remove_section.

*Source: `tools/knowledge.ts:149`*

### `add_section`

Append a section to an existing entry.

*Source: `tools/knowledge.ts:194`*

### `update_section`

Update a section's description, content, and/or title (via `new_title`). At least one of description/content/new_title is required.

*Source: `tools/knowledge.ts:219`*

### `remove_section`

Delete a section from an entry.

*Source: `tools/knowledge.ts:259`*

### `remove_knowledge`

Delete a knowledge entry and all its sections (via ON DELETE CASCADE).

*Source: `tools/knowledge.ts:280`*

### `add_reminder`

Save a future reminder. `when` is parsed server-side (relative or absolute).

*Source: `tools/reminder.ts:10`*

### `list_reminders`

List reminders, soonest first.

*Source: `tools/reminder.ts:31`*

### `update_reminder`

Edit a reminder's text and/or due time. Provide at least one field.

*Source: `tools/reminder.ts:59`*

### `delete_reminder`

Remove a reminder by id.

*Source: `tools/reminder.ts:93`*

### `get_current_time`

Return the current local time and ISO 8601.

*Source: `tools/reminder.ts:107`*

## Skills

Markdown guides the agent loads before using the corresponding tools.

| Skill | Title | Summary |
|---|---|---|
| `knowledge` | Knowledge Skill | Nine tools for a slug-keyed knowledge store. Load this once before first use. |
| `reminder` | Reminder Skill | Five tools for scheduled reminders. Load this once before first use. |

## Database schema

### `database/knowledge.db`

#### `knowledge` — 0 row(s)

| Column | Type |
|---|---|
| `id` | `INTEGER` |
| `name` | `TEXT` |
| `description` | `TEXT` |
| `tags` | `TEXT` |
| `created_at` | `TEXT` |

### `database/reminders.db`

#### `reminders` — 0 row(s)

| Column | Type |
|---|---|
| `id` | `INTEGER` |
| `text` | `TEXT` |
| `due_at` | `INTEGER` |
| `created_at` | `INTEGER` |

## Dependencies

**Runtime**

| Package | Version |
|---|---|
| `@modelcontextprotocol/server` | `^2.3.1` |
| `zod` | `^4.6.7` |

**Development**

| Package | Version |
|---|---|
| `@types/bun` | `latest` |
| `typescript` | `^7.0.2` |

## Source stats

| File | Lines |
|---|---|
| `tools/knowledge.ts` | 295 |
| `tools/reminder.ts` | 118 |
| `database/knowledge-db.ts` | 98 |
| `utils/time.ts` | 90 |
| `tools/agent.ts` | 49 |
| `database/reminder-db.ts` | 43 |
| `config/time.ts` | 24 |
| `config/skills.ts` | 19 |
| `index.ts` | 17 |
| `utils/db.ts` | 17 |
| `utils/tags.ts` | 13 |
| `config/database.ts` | 10 |
| `utils/slug.ts` | 10 |
| `utils/mcp.ts` | 9 |
| `config/limits.ts` | 5 |
| `config/server.ts` | 5 |
| `utils/errors.ts` | 4 |

## Notes

- `database/*.db-wal` and `*.db-shm` are SQLite Write-Ahead Log sidecars — runtime 
  artifacts, not source. Add `database/*.db*` to `.gitignore`.
- Entry names and section titles are slugified (`lowercase-hyphenated`). `"Foo Bar"` and 
  `"foo-bar"` collide by design; section-title uniqueness is enforced per entry.
- Renaming an entry does **not** touch its sections — the foreign key is on the numeric `id`, 
  not on the name.
- Tags on `update_knowledge` **replace** the full array; read first and pass old ∪ new to append.