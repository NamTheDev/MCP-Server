import {
  Client,
  Events,
  GatewayIntentBits,
  MessageFlags,
  Partials,
  type ButtonInteraction,
} from "discord.js";
import { resolveApproval } from "./approval";

let client: Client | null = null;

export async function startDiscordGateway(): Promise<void> {
  if (client) return;

  const c = new Client({
    intents: [GatewayIntentBits.Guilds],
    partials: [Partials.Channel],
  });

  c.once(Events.ClientReady, (me) => {
    console.error(`[gateway] logged in as ${me.user.tag} (${me.user.id})`);
  });

  c.on(Events.Error, (e) => {
    console.error(`[gateway] error: ${e.message}`);
  });

  c.on(Events.InteractionCreate, async (i) => {
    if (!i.isButton()) return;
    await handleButton(i);
  });

  await c.login(Bun.env.DISCORD_TOKEN);
  client = c;
}

async function handleButton(i: ButtonInteraction): Promise<void> {
  const [ns, action, id] = i.customId.split(":");
  if (ns !== "mcp" || !action || !id) return;

  const decision =
    action === "approve"
      ? "approved"
      : action === "deny"
        ? "denied"
        : action === "allow15"
          ? "allow15"
          : null;
  if (!decision) return;

  const label = resolveApproval(id, decision, i.user.id);

  try {
    if (label) {
      await i.update({ content: label, embeds: [], components: [] });
    } else {
      await i.reply({
        content: "This request is no longer valid.",
        flags: MessageFlags.Ephemeral,
      });
    }
  } catch (e) {
    console.error(
      `[gateway] failed to update interaction: ${(e as Error).message}`,
    );
  }
}
