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

type Registrar = (server: McpServer) => void;

const GROUPS: Record<string, Registrar[]> = {
  reminder: [registerReminderTools],
  knowledge: [registerKnowledgeTools],
  discord: [registerDiscordTools],
  agent: [registerAgentTools],
};

const ALL: Registrar[] = [
  registerReminderTools,
  registerKnowledgeTools,
  registerDiscordTools,
  registerAgentTools,
];

const mount = (name: string, registrars: Registrar[]) => {
  const handler = createMcpHandler(() => {
    const server = new McpServer({
      name: `${SERVER.name}-${name}`,
      version: SERVER.version,
    });
    for (const r of registrars) r(server);
    return server;
  });
  return toNodeHandler(handler);
};

const handlers = new Map<string, ReturnType<typeof mount>>();
for (const [name, registrars] of Object.entries(GROUPS)) {
  handlers.set(`/mcp/${name}`, mount(name, registrars));
}
handlers.set("/mcp", mount("all", ALL));

const validateHost = localhostHostValidation();
const validateOrigin = localhostOriginValidation();

const http = createServer((req, res) => {
  if (!validateHost(req, res) || !validateOrigin(req, res)) return;

  const raw = (req.url ?? "/").split("?")[0] ?? "/";
  const pathname = raw.replace(/\/+$/, "") || "/";

  if (req.method === "GET" && pathname === "/health") {
    res.writeHead(200, { "Content-Type": "text/plain" }).end("ok");
    return;
  }

  const nodeHandler = handlers.get(pathname);
  if (!nodeHandler) {
    res.writeHead(404, { "Content-Type": "text/plain" }).end("not found");
    return;
  }

  reqContext.run({ headers: req.headers }, () => {
    void nodeHandler(req, res);
  });
});

http.listen(HTTP.port, HTTP.host, () => {
  console.error(
    `[${SERVER.name}] MCP server listening on http://${HTTP.host}:${HTTP.port}`,
  );
  for (const p of handlers.keys()) {
    console.error(`  - http://${HTTP.host}:${HTTP.port}${p}`);
  }
});

startReminderScheduler();

if (Bun.env.DISCORD_VERIFY_ENABLED === "1") {
  startDiscordGateway().catch((e) =>
    console.error(`[gateway] failed to start: ${(e as Error).message}`),
  );
}
