export function parseTags(raw: string): string[] {
  try {
    const parsed = JSON.parse(raw);
    return Array.isArray(parsed) ? (parsed as string[]) : [];
  } catch {
    return [];
  }
}

export function serializeTags(tags: string[] | undefined): string {
  return JSON.stringify(tags ?? []);
}
