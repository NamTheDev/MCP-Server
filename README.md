# mcp-reminders

An MCP (Model Context Protocol) server that gives an AI assistant two persistent capabilities over stdio:

- **Reminders** — schedule, list, edit, and delete time-based reminders with flexible natural-language time parsing.
- **Knowledge** — store, search, read, and edit structured notes ("knowledge entries") organized into sections and tagged for retrieval.

Both stores are backed by SQLite (via `bun:sqlite`) and survive restarts. The server also exposes a small **skills** system: markdown guidance documents that tell the agent *how* to use each tool group before it starts.

---

## Requirements

- [Bun](https://bun.sh) `1.x`
- No external services. Databases are created on first run.

## Install & Run

```bash
bun install
bun start          # run the MCP server on stdio
bun run dev        # watch mode
bun run check      # typecheck + build sanity check
```

The server speaks MCP over stdio, so it is meant to be launched by an MCP client (Claude Desktop, an IDE plugin, etc.), not used interactively.

### Example MCP client config

```json
{
  "mcpServers": {
    "assistant": {
      "command": "bun",
      "args": ["run", "/absolute/path/to/mcp-reminders/index.ts"]
    }
  }
}
```

---

## Layout

```
index.ts                 # MCP server entrypoint (registers all tools)
config/                  # server identity, DB paths, limits, time constants, skills registry
database/                # SQLite schema + prepared statements (reminders, knowledge)
tools/                   # MCP tool implementations (reminder, knowledge, agent/skills)
skills/                  # Markdown guidance docs loaded by the agent at runtime
utils/                   # small helpers: db, mcp responses, slugify, tags, time parsing, errors
```

`database/*.db*` files and `script.sh` are git-ignored. SQLite databases are created under `database/` on first run.

---

## Tools

### Agent / skills

| Tool | Description |
| --- | --- |
| `list_skills()` | List the available skill documents and their descriptions. |
| `get_skill(name)` | Fetch a skill's full markdown guidance. Intended to be called once before using a tool group. |

Two skills are registered: `reminder` and `knowledge`.

### Reminders

| Tool | Input | Notes |
| --- | --- | --- |
| `add_reminder` | `text`, `when` | `when` parsed server-side; past times rejected. |
| `list_reminders` | `include_past?`, `limit?` | Soonest first. Default limit 20, max 50. |
| `update_reminder` | `id`, `text?`, `when?` | At least one of `text`/`when` required. |
| `delete_reminder` | `id` | |
| `get_current_time` | — | Returns local time + ISO 8601. |

**Accepted `when` formats**

- Relative durations: `10 days`, `in 2 hours`, `30m`, `2w`, `1y`
- Bare keywords: `tomorrow`, `next week`, `next month`, `next year`
- Date-only: `2026-11-01`
- Full date-time: `2026-11-01T14:00`
- Any string `Date` can parse, as a fallback

Bare keywords and date-only strings land at **09:00 local time** (`DEFAULT_HOUR`).

### Knowledge

| Tool | Description |
| --- | --- |
| `store_knowledge(name, description, sections[], tags?)` | Create an entry. Names and section titles are slugified. |
| `list_knowledge(tag?)` | All entries (or filtered by tag) with their section titles. |
| `search_knowledge(query)` | Substring match across names, descriptions, section titles, and content. |
| `read_knowledge(name, section?)` | Without `section`, returns the entry index (name + per-section descriptions). With `section`, returns that section's markdown. |
| `update_knowledge(name, description?, tags?, new_name?)` | Edit metadata or rename. `tags` **replaces** the array. |
| `add_section(name, section)` | Append a section. |
| `update_section(name, title, description?, content?, new_title?)` | Edit a section or rename it. |
| `remove_section(name, title)` | Delete one section. |
| `remove_knowledge(name)` | Delete an entry and all its sections (cascade). |

A section is `{ title, description, content }` — all three are required and non-empty. Slugs are lowercased with hyphens; `"Foo Bar"` and `"foo-bar"` collide.

---

## Configuration

Environment variables override DB locations:

| Variable | Default |
| --- | --- |
| `KNOWLEDGE_DB_PATH` | `database/knowledge.db` |
| `REMINDER_DB_PATH` | `database/reminders.db` |

Other constants live under `config/`:

- `config/limits.ts` — reminder list default/max (20 / 50).
- `config/time.ts` — time units, `DEFAULT_HOUR`, and the relative/date regexes.
- `config/server.ts` — server name (`assistant`) and version (read from `package.json`).
- `config/skills.ts` — skill registry and the `skills/` directory.

---

## Data model

SQLite, WAL mode. `database/knowledge.db` and `database/reminders.db` are created lazily.

- `reminders(id, text, due_at, created_at)` with an index on `due_at`.
- `knowledge(id, name UNIQUE, description, tags JSON, created_at)`
- `knowledge_sections(id, knowledge_id → knowledge.id ON DELETE CASCADE, position, title, description, content, UNIQUE(knowledge_id, title))`

Tags are stored as a JSON array in `knowledge.tags`.

---

## Development

```bash
bun run typecheck    # tsc --noEmit
bun run build:check  # bun build sanity check (output to /tmp, then removed)
bun run check        # both of the above
```

TypeScript is configured with `strict`, `noUncheckedIndexedAccess`, `verbatimModuleSyntax`, and `moduleResolution: "bundler"`.

Commit messages follow `notes/commit-message-format.txt`:

```
<type>: <short description in imperative mood>
```

---

## License

MIT — see [LICENSE](./LICENSE).