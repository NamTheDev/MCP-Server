# Knowledge Skill

Nine tools for a slug-keyed knowledge store. Load this once before first use.

## Tools

- `store_knowledge(name, description, sections[{title, description, content}], tags?)`
- `list_knowledge(tag?)` — all entries, or filter by tag
- `search_knowledge(query)` — substring across names, descriptions, titles, content
- `read_knowledge(name, section?)` — index if no section; markdown if section given
- `update_knowledge(name, description?, tags?, new_name?)`
- `add_section(name, section)`
- `update_section(name, title, description?, content?, new_title?)`
- `remove_section(name, title)`
- `remove_knowledge(name)`

## Examples

User: "Remember that wa marks topic and ga marks subject in Japanese."
→ store_knowledge(
    name="japanese-particles",
    description="Topic (wa) and subject (ga) markers in Japanese.",
    sections=[{
      title="overview",
      description="Wa marks topic; ga marks subject.",
      content="<user's words verbatim>"
    }],
    tags=["japanese", "grammar"]
  )

User: "What do I have on Japanese?"
→ search_knowledge(query="japanese")

User: "Show me everything."
→ list_knowledge()

User: "What's in the particles entry?"
→ read_knowledge(name="japanese-particles")            # index
→ read_knowledge(name="japanese-particles", section="overview")   # content

User: "Add a section about the 'no' particle."
→ add_section(name="japanese-particles", section={
    title="no",
    description="Possessive / modifier particle.",
    content="<verbatim>"
  })

User: "Change the overview text."
→ update_section(name="japanese-particles", title="overview", content="<new text>")

User: "Rename 'japanese-particles' to 'japanese'."
→ update_knowledge(name="japanese-particles", new_name="japanese")

User: "Forget the particles entry."
→ remove_knowledge(name="japanese-particles")

## Rules

- Names and section titles are slugified: lowercase, hyphens only. "Foo Bar" and "foo-bar" collide.
- Every section needs non-empty title, description, content. Write descriptions yourself — never ask the user.
- `content` is the user's text VERBATIM. Never invent facts or elaborate.
- Tags in `update_knowledge` REPLACE the array. Pass old ∪ new to append.
- If nothing matches, say "nothing stored on that" and stop.
