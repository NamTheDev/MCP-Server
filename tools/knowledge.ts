import type { McpServer } from "@modelcontextprotocol/server";
import * as z from "zod/v4";
import { kdb, kstatements, type KnowledgeRow } from "../database/knowledge-db";
import { msg } from "../utils/errors";
import { err, ok } from "../utils/mcp";
import { slugify } from "../utils/slug";
import { parseTags, serializeTags } from "../utils/tags";

const readTags = (row: KnowledgeRow): string[] => parseTags(row.tags);

const sectionSchema = z.object({
  title: z.string().min(1),
  description: z.string().min(1),
  content: z.string().min(1),
});

export function registerKnowledgeTools(server: McpServer): void {
  server.registerTool(
    "store_knowledge",
    {
      description:
        "Save a knowledge entry. `name` and section titles are slugified.",
      inputSchema: {
        name: z.string().min(1),
        description: z.string().min(1),
        sections: z.array(sectionSchema).min(1),
        tags: z.array(z.string()).optional(),
      },
    },
    async ({ name, description, sections, tags }) => {
      const slug = slugify(name);
      if (!slug) return err("Name must contain at least one alphanumeric character.");
      if (kstatements.getKnowledge.get(slug)) return err(`Entry "${slug}" already exists.`);

      const norm: { title: string; description: string; content: string }[] = [];
      const seen = new Set<string>();
      for (const s of sections) {
        const t = slugify(s.title);
        if (!t) return err(`Section title "${s.title}" slugifies to nothing.`);
        if (seen.has(t)) return err(`Duplicate section title after slugify: "${t}".`);
        seen.add(t);
        norm.push({ title: t, description: s.description, content: s.content });
      }

      const now = Date.now();
      const tagJson = serializeTags(tags);

      try {
        kdb.transaction(() => {
          const row = kstatements.insertKnowledge.get(slug, description, tagJson, now);
          if (!row) throw new Error("insert returned no row");
          norm.forEach((s, i) => {
            kstatements.insertSection.get(row.id, i, s.title, s.description, s.content);
          });
        })();
      } catch (e) {
        return err(`Failed to store: ${msg(e)}`);
      }

      return ok(
        `Saved "${slug}" with ${norm.length} section${norm.length === 1 ? "" : "s"}.`,
      );
    },
  );

  server.registerTool(
    "list_knowledge",
    {
      description:
        "List all knowledge entries (name, tags, description, section titles). Optional tag filter.",
      inputSchema: { tag: z.string().optional() },
    },
    async ({ tag }) => {
      const rows = kstatements.listKnowledge.all();
      const filtered = tag ? rows.filter((r) => readTags(r).includes(tag)) : rows;
      if (filtered.length === 0) {
        return ok(tag ? `No entries tagged "${tag}".` : "No knowledge stored.");
      }
      const out = filtered.map((r) => {
        const tags = readTags(r);
        const secs = kstatements.listSections.all(r.id).map((s) => s.title);
        const tagStr = tags.length ? ` [${tags.join(", ")}]` : "";
        return `- ${r.name}${tagStr}: ${r.description}\n  sections: ${secs.join(", ") || "(none)"}`;
      });
      return ok(out.join("\n"));
    },
  );

  server.registerTool(
    "search_knowledge",
    {
      description:
        "Substring search across entry names, descriptions, and section titles/content.",
      inputSchema: { query: z.string().min(1) },
    },
    async ({ query }) => {
      const hits = kstatements.search.all(query);
      if (hits.length === 0) return ok(`No matches for "${query}".`);
      const out: string[] = [];
      for (const h of hits) {
        const row = kstatements.getKnowledge.get(h.name);
        if (!row) continue;
        const secs = kstatements.listSections.all(row.id).map((s) => s.title);
        out.push(`- ${row.name}: ${row.description} [${secs.join(", ")}]`);
      }
      return ok(out.join("\n"));
    },
  );

  server.registerTool(
    "read_knowledge",
    {
      description:
        "Without `section`: returns the entry's index (name + per-section description). " +
        "With `section`: returns that section's markdown content.",
      inputSchema: {
        name: z.string().min(1),
        section: z.string().optional(),
      },
    },
    async ({ name, section }) => {
      const slug = slugify(name);
      const row = kstatements.getKnowledge.get(slug);
      if (!row) return err(`No entry "${slug}".`);

      const secs = kstatements.listSections.all(row.id);

      if (section === undefined) {
        const index = {
          name: row.name,
          description: row.description,
          tags: readTags(row),
          sections: Object.fromEntries(secs.map((s) => [s.title, s.description])),
        };
        return ok(JSON.stringify(index, null, 2));
      }

      const sSlug = slugify(section);
      const sec = secs.find((s) => s.title === sSlug);
      if (!sec) {
        const available = secs.map((s) => s.title).join(", ") || "(none)";
        return err(`No section "${sSlug}" in "${slug}". Available: ${available}.`);
      }
      return ok(`# ${row.name} / ${sec.title}\n\n${sec.content}`);
    },
  );

  server.registerTool(
    "update_knowledge",
    {
      description:
        "Update an entry's description, tags, and/or name (via `new_name`). " +
        "Sections are managed by add_section / update_section / remove_section.",
      inputSchema: {
        name: z.string().min(1),
        description: z.string().min(1).optional(),
        tags: z.array(z.string()).optional(),
        new_name: z.string().min(1).optional(),
      },
    },
    async ({ name, description, tags, new_name }) => {
      const slug = slugify(name);
      const row = kstatements.getKnowledge.get(slug);
      if (!row) return err(`No entry "${slug}".`);
      if (description === undefined && tags === undefined && new_name === undefined) {
        return err("Provide description, tags, and/or new_name.");
      }

      let nextName = row.name;
      if (new_name !== undefined) {
        const nn = slugify(new_name);
        if (!nn) return err(`new_name "${new_name}" slugifies to nothing.`);
        if (nn !== row.name && kstatements.getKnowledge.get(nn)) {
          return err(`Entry "${nn}" already exists.`);
        }
        nextName = nn;
      }

      const nextDesc = description ?? row.description;
      const nextTags = tags !== undefined
        ? serializeTags(tags)
        : row.tags;
      kstatements.updateKnowledge.get(nextName, nextDesc, nextTags, slug);

      return ok(
        nextName === slug
          ? `Updated "${slug}".`
          : `Updated "${nextName}" (renamed from "${slug}").`,
      );
    },
  );

  server.registerTool(
    "add_section",
    {
      description: "Append a section to an existing entry.",
      inputSchema: {
        name: z.string().min(1),
        section: sectionSchema,
      },
    },
    async ({ name, section }) => {
      const slug = slugify(name);
      const row = kstatements.getKnowledge.get(slug);
      if (!row) return err(`No entry "${slug}".`);
      const t = slugify(section.title);
      if (!t) return err(`Section title "${section.title}" slugifies to nothing.`);
      if (kstatements.getSection.get(row.id, t)) {
        return err(`Section "${t}" already exists in "${slug}".`);
      }
      const posRow = kstatements.nextPosition.get(row.id);
      const pos = posRow?.next ?? 0;
      kstatements.insertSection.get(row.id, pos, t, section.description, section.content);
      return ok(`Added section "${t}" to "${slug}".`);
    },
  );

  server.registerTool(
    "update_section",
    {
      description:
        "Update a section's description, content, and/or title (via `new_title`). " +
        "At least one of description/content/new_title is required.",
      inputSchema: {
        name: z.string().min(1),
        title: z.string().min(1),
        description: z.string().min(1).optional(),
        content: z.string().min(1).optional(),
        new_title: z.string().min(1).optional(),
      },
    },
    async ({ name, title, description, content, new_title }) => {
      const slug = slugify(name);
      const row = kstatements.getKnowledge.get(slug);
      if (!row) return err(`No entry "${slug}".`);
      const t = slugify(title);
      const sec = kstatements.getSection.get(row.id, t);
      if (!sec) return err(`No section "${t}" in "${slug}".`);
      if (description === undefined && content === undefined && new_title === undefined) {
        return err("Provide description, content, and/or new_title.");
      }
      let nextTitle = sec.title;
      if (new_title !== undefined) {
        const nt = slugify(new_title);
        if (!nt) return err(`new_title "${new_title}" slugifies to nothing.`);
        if (nt !== sec.title && kstatements.getSection.get(row.id, nt)) {
          return err(`Section "${nt}" already exists in "${slug}".`);
        }
        nextTitle = nt;
      }
      const nextDesc = description ?? sec.description;
      const nextContent = content ?? sec.content;
      kstatements.updateSection.get(nextTitle, nextDesc, nextContent, sec.id);
      return ok(`Updated section "${nextTitle}" in "${slug}".`);
    },
  );

  server.registerTool(
    "remove_section",
    {
      description: "Delete a section from an entry.",
      inputSchema: {
        name: z.string().min(1),
        title: z.string().min(1),
      },
    },
    async ({ name, title }) => {
      const slug = slugify(name);
      const row = kstatements.getKnowledge.get(slug);
      if (!row) return err(`No entry "${slug}".`);
      const t = slugify(title);
      const sec = kstatements.getSection.get(row.id, t);
      if (!sec) return err(`No section "${t}" in "${slug}".`);
      kstatements.removeSection.run(sec.id);
      return ok(`Removed section "${t}" from "${slug}".`);
    },
  );

  server.registerTool(
    "remove_knowledge",
    {
      description:
        "Delete a knowledge entry and all its sections (via ON DELETE CASCADE).",
      inputSchema: { name: z.string().min(1) },
    },
    async ({ name }) => {
      const slug = slugify(name);
      const row = kstatements.getKnowledge.get(slug);
      if (!row) return err(`No entry "${slug}".`);
      kstatements.removeKnowledge.run(slug);
      return ok(`Removed "${slug}".`);
    },
  );
}
