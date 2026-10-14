export function slugify(input: string): string {
  return input
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-+|-+$/g, "");
}

export const NAME_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
