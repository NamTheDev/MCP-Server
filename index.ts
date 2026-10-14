import { McpServer } from "@modelcontextprotocol/server";
import { StdioServerTransport } from "@modelcontextprotocol/server/stdio";
import { SERVER } from "./config/server";
import { registerAgentTools } from "./tools/agent";
import { registerKnowledgeTools } from "./tools/knowledge";
import { registerReminderTools } from "./tools/reminder";

const server = new McpServer({ name: SERVER.name, version: SERVER.version });
registerReminderTools(server);
registerKnowledgeTools(server);
registerAgentTools(server);

const transport = new StdioServerTransport();
await server.connect(transport);

console.error(`[${SERVER.name}] MCP server ready on stdio`);
