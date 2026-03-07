import { z } from 'zod';

/** MCP tool definition with Zod input schema */
export interface ToolDefinition {
  name: string;
  description: string;
  inputSchema: z.ZodTypeAny;
}

/** MCP tool result */
export interface ToolResult {
  content: Array<{ type: string; text: string }>;
  isError?: boolean;
}

/** Provider interface — all tool providers must implement this */
export interface Provider {
  readonly name: string;
  getTools(): ToolDefinition[];
  handleToolCall(toolName: string, args: Record<string, unknown>): Promise<ToolResult>;
  initialize?(): Promise<void>;
  shutdown(): Promise<void>;
}
