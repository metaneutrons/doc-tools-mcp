import { readTools } from './read.js';
import { writeTools } from './write.js';
import { ToolDefinition } from '../../../shared/types.js';

export function bibTools(): ToolDefinition[] {
  return [...readTools(), ...writeTools()];
}
