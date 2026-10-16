const API_BASE = "https://discord.com/api/v10";
const MAX_RETRIES = 4;

const sleep = (ms: number) => new Promise((r) => setTimeout(r, ms));

export async function discordFetch<T = unknown>(
  path: string,
  init: RequestInit = {},
  attempt = 0,
): Promise<T> {
  const token = Bun.env.DISCORD_TOKEN;
  if (!token) throw new Error("DISCORD_TOKEN is not set in the environment.");

  const res = await fetch(`${API_BASE}${path}`, {
    ...init,
    headers: {
      Authorization: `Bot ${token}`,
      "Content-Type": "application/json",
      "User-Agent": "DiscordBot (mcp-assistant, 1.0)",
      ...(init.headers ?? {}),
    },
  });

  if (res.status === 429) {
    if (attempt >= MAX_RETRIES) {
      throw new Error(`rate limited after ${MAX_RETRIES} retries`);
    }
    const ra = Number(res.headers.get("retry-after") ?? "1");
    const wait = (Number.isFinite(ra) && ra > 0 ? ra : 1) * 1000 + 250;
    await sleep(wait);
    return discordFetch<T>(path, init, attempt + 1);
  }

  if (res.status >= 500 && attempt < MAX_RETRIES) {
    await sleep(500 * 2 ** attempt);
    return discordFetch<T>(path, init, attempt + 1);
  }

  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(`Discord ${res.status} ${res.statusText}: ${body.slice(0, 500)}`);
  }

  if (res.status === 204) return undefined as T;
  return (await res.json()) as T;
}

/**
 * Open (or fetch) a DM channel with `userId` and post a message to it.
 * Returns the created message object.
 */
export async function sendDm(
  userId: string,
  body: { content?: string; embeds?: unknown[]; tts?: boolean },
): Promise<unknown> {
  const channel = await discordFetch<{ id: string }>("/users/@me/channels", {
    method: "POST",
    body: JSON.stringify({ recipient_id: userId }),
  });
  return discordFetch(`/channels/${channel.id}/messages`, {
    method: "POST",
    body: JSON.stringify(body),
  });
}
