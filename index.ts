import { createMcpHandler, McpServer } from "@modelcontextprotocol/server";
import {
  localhostHostValidation,
  localhostOriginValidation,
  toNodeHandler,
} from "@modelcontextprotocol/node";
import { createServer } from "node:http";
import { HTTP, SERVER } from "./config/server";
import { registerAgentTools } from "./tools/agent";
import { registerKnowledgeTools } from "./tools/knowledge";
import { registerReminderTools } from "./tools/reminder";
import { registerDiscordTools } from "./tools/discord";
import { startReminderScheduler } from "./utils/reminder-scheduler";
import { reqContext } from "./utils/context";
import { startDiscordGateway } from "./utils/discord-gateway";

// The factory runs once per request; build a fresh McpServer each time.
const handler = createMcpHandler(() => {
  const server = new McpServer({ name: SERVER.name, version: SERVER.version });
  registerReminderTools(server);
  registerKnowledgeTools(server);
  registerDiscordTools(server);
  registerAgentTools(server);
  return server;
});

const nodeHandler = toNodeHandler(handler);
const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();

const http = createServer((req, res) => {
  // DNS-rebinding guards. Reject anything that isn't a localhost request
  // before the MCP handler sees it.
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;

  // Liveness probe, outside the MCP path.
  if (req.method === "GET" && req.url === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    return;
  }

  reqContext.run({ headers: req.headers }, () => {
    void nodeHandler(req, res);
  });
});

http.listen(HTTP.port, HTTP.host, () => {
  console.error(
    `[${SERVER.name}] MCP server listening on http://${HTTP.host}:${HTTP.port}/mcp`,
  );
});

// Runs inside the same long-lived process. Now that LM Studio connects to an
// already-running server instead of spawning one per chat, this actually
// fires on schedule regardless of whether a chat is open.
startReminderScheduler();

// Discord gateway: required for the DM-button approval flow.
// Runs outbound (no public port needed).
if (Bun.env.DISCORD_VERIFY_ENABLED === "1") {
  startDiscordGateway().catch((e) =>
    console.error(`[gateway] failed to start: ${(e as Error).message}`),
  );
}
