import { resolve } from "node:path";

export const SKILLS_DIR = resolve(import.meta.dir, "..", "skills");

export type SkillMeta = { file: string; description: string };

export const SKILLS: Record<string, SkillMeta> = {
  reminder: {
    file: "reminder.md",
    description:
      "How to use reminder tools: add, list, update, delete, and time parsing.",
  },
  knowledge: {
    file: "knowledge.md",
    description:
      "How to use knowledge tools: store, list, search, read, update, and edit sections.",
  },
  discord: {
    file: "discord.md",
    description:
      "How to use the Discord tools: read/write messages, manage channels, roles, members, threads, and webhooks.",
  },
};
