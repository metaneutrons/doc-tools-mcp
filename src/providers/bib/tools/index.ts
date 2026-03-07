import { readTools } from './read.js';
import { writeTools } from './write.js';
import { ToolDefinition } from '../../../shared/types.js';

export const bibTools: ToolDefinition[] = [...readTools, ...writeTools];
