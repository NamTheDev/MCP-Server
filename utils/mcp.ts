export const ok = (text: string) => ({
  content: [{ type: "text" as const, text }],
});

export const err = (text: string) => ({
  content: [{ type: "text" as const, text }],
  isError: true as const,
});
