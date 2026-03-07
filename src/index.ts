#!/usr/bin/env node
import { Server } from '@modelcontextprotocol/sdk/server/index.js';
import { StdioServerTransport } from '@modelcontextprotocol/sdk/server/stdio.js';
import { CallToolRequestSchema, ListToolsRequestSchema } from '@modelcontextprotocol/sdk/types.js';
import { z } from 'zod';
import { Provider, ToolResult } from './shared/types.js';
import { rootLogger } from './shared/logger.js';
import { readFileSync, readdirSync } from 'fs';
import { fileURLToPath } from 'url';
import { dirname, join } from 'path';

const __filename = fileURLToPath(import.meta.url);
const __dirname = dirname(__filename);

const packageJson = JSON.parse(readFileSync(join(__dirname, '../package.json'), 'utf-8'));

if (process.argv.includes('--version') || process.argv.includes('-v')) {
  console.log(packageJson.version);
  process.exit(0);
}

if (process.argv.includes('--help') || process.argv.includes('-h')) {
  console.log(`
Doc Tools MCP Server v${packageJson.version}

A Model Context Protocol server for managing pandoc/CSL-YAML bibliographies.

USAGE:
  node dist/index.js [OPTIONS]

OPTIONS:
  -h, --help       Print this help message
  -v, --version    Print version number
`);
  process.exit(0);
}

// Provider registry
const providers: Map<string, Provider> = new Map();

async function registerProvider(provider: Provider): Promise<void> {
  providers.set(provider.name, provider);
  if (provider.initialize) await provider.initialize();
}

function getAllTools() {
  return Array.from(providers.values()).flatMap((p) => p.getTools());
}

async function handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult> {
  const colonIndex = toolName.indexOf(':');
  if (colonIndex === -1) {
    return { content: [{ type: 'text', text: `Unknown tool: ${toolName}` }], isError: true };
  }

  const prefix = toolName.substring(0, colonIndex);
  const provider = providers.get(prefix);
  if (!provider) {
    return { content: [{ type: 'text', text: `Unknown provider: ${prefix}` }], isError: true };
  }

  return provider.handleToolCall(toolName, args);
}

// Create MCP server
const server = new Server(
  { name: 'doc-tools-mcp', version: packageJson.version },
  { capabilities: { tools: {} } },
);

server.setRequestHandler(ListToolsRequestSchema, async () => ({
  tools: getAllTools().map((tool) => ({
    name: tool.name,
    description: tool.description,
    inputSchema: (tool.inputSchema as z.ZodTypeAny).toJSONSchema(),
  })),
}));

server.setRequestHandler(CallToolRequestSchema, async (request) => {
  const { name, arguments: args } = request.params;
  const startTime = Date.now();
  rootLogger.info('Tool call', { tool: name });

  try {
    const result = await handleToolCall(name, (args as Record<string, unknown>) ?? {});
    rootLogger.info('Tool call completed', { tool: name, duration: Date.now() - startTime });
    return { content: result.content, isError: result.isError };
  } catch (error) {
    rootLogger.error('Tool call failed', error as Error, { tool: name, duration: Date.now() - startTime });
    return {
      content: [{ type: 'text', text: `Error: ${error instanceof Error ? error.message : String(error)}` }],
      isError: true,
    };
  }
});

// Graceful shutdown
let isShuttingDown = false;
async function cleanup(signal?: string) {
  if (isShuttingDown) return;
  isShuttingDown = true;
  rootLogger.info('Shutdown', { signal });
  for (const provider of providers.values()) {
    await provider.shutdown();
  }
  process.exit(0);
}

process.on('SIGINT', () => cleanup('SIGINT'));
process.on('SIGTERM', () => cleanup('SIGTERM'));
process.stdin.on('close', () => cleanup('stdin close'));

// Dynamic provider loading
const providersDir = join(__dirname, 'providers');
for (const entry of readdirSync(providersDir, { withFileTypes: true })) {
  if (!entry.isDirectory()) continue;
  try {
    const mod = await import(`./providers/${entry.name}/index.js`);
    if (typeof mod.createProvider === 'function') {
      const provider = mod.createProvider() as Provider | null;
      if (provider) {
        await registerProvider(provider);
        rootLogger.info(`Provider registered: ${provider.name}`);
      }
    }
  } catch (error) {
    rootLogger.error(`Failed to load provider: ${entry.name}`, error);
  }
}

const transport = new StdioServerTransport();
await server.connect(transport);
rootLogger.info('MCP server connected and ready');
