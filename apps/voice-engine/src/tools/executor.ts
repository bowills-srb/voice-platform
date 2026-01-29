import { Tool } from '@voice-platform/database';
import { ToolDefinition } from '../providers/llm';
import { logger } from '../utils/logger';

export class ToolExecutor {
  private tools: Map<string, Tool>;

  constructor(tools: Tool[]) {
    this.tools = new Map(tools.map(t => [t.name, t]));
  }

  getToolDefinitions(): ToolDefinition[] {
    const definitions: ToolDefinition[] = [];

    for (const [name, tool] of this.tools) {
      if (tool.type === 'function' && tool.functionDefinition) {
        const funcDef = tool.functionDefinition as {
          name: string;
          description: string;
          parameters: Record<string, unknown>;
        };
        definitions.push({
          name: funcDef.name,
          description: funcDef.description,
          parameters: funcDef.parameters,
        });
      } else if (tool.type === 'transfer') {
        definitions.push({
          name: 'transferCall',
          description: tool.description || 'Transfer the call to another person or department',
          parameters: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                description: 'Reason for the transfer',
              },
              destination: {
                type: 'string',
                description: 'Who or where to transfer to',
              },
            },
            required: ['destination'],
          },
        });
      } else if (tool.type === 'endCall') {
        definitions.push({
          name: 'endCall',
          description: 'End the call when the conversation is complete',
          parameters: {
            type: 'object',
            properties: {
              reason: {
                type: 'string',
                description: 'Reason for ending the call',
              },
            },
          },
        });
      } else if (tool.type === 'query') {
        definitions.push({
          name: `queryKnowledge_${tool.id}`,
          description: tool.description || 'Search the knowledge base for information',
          parameters: {
            type: 'object',
            properties: {
              query: {
                type: 'string',
                description: 'The search query',
              },
            },
            required: ['query'],
          },
        });
      } else if (tool.type === 'dtmf') {
        definitions.push({
          name: 'pressDigits',
          description: 'Press phone keypad digits (DTMF tones)',
          parameters: {
            type: 'object',
            properties: {
              digits: {
                type: 'string',
                description: 'The digits to press (0-9, *, #)',
              },
            },
            required: ['digits'],
          },
        });
      }
    }

    return definitions;
  }

  async execute(name: string, args: Record<string, unknown>): Promise<unknown> {
    logger.info({ name, args }, 'Executing tool');

    // Handle built-in tools
    if (name === 'endCall') {
      return { action: 'end_call', reason: args.reason };
    }

    if (name === 'transferCall') {
      return { action: 'transfer', destination: args.destination, reason: args.reason };
    }

    if (name === 'pressDigits') {
      return { action: 'dtmf', digits: args.digits };
    }

    if (name.startsWith('queryKnowledge_')) {
      const toolId = name.replace('queryKnowledge_', '');
      return await this.queryKnowledgeBase(toolId, args.query as string);
    }

    // Handle custom function tools
    const tool = Array.from(this.tools.values()).find(t => {
      const funcDef = t.functionDefinition as { name: string } | null;
      return funcDef?.name === name;
    });

    if (!tool || !tool.serverUrl) {
      return { error: `Unknown tool: ${name}` };
    }

    try {
      const response = await fetch(tool.serverUrl, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          tool: name,
          arguments: args,
        }),
        signal: AbortSignal.timeout(10000), // 10 second timeout
      });

      if (!response.ok) {
        throw new Error(`Tool server error: ${response.status}`);
      }

      return await response.json();
    } catch (error: any) {
      logger.error({ name, error: error.message }, 'Tool execution error');
      return { error: error.message };
    }
  }

  private async queryKnowledgeBase(toolId: string, query: string): Promise<unknown> {
    // In production, this would use vector search
    // For now, return a placeholder
    logger.info({ toolId, query }, 'Knowledge base query');

    // TODO: Implement actual vector search
    // 1. Get embeddings for query
    // 2. Search knowledge_chunks with pgvector
    // 3. Return top results

    return {
      results: [
        {
          content: 'This is a placeholder result. Implement vector search.',
          score: 0.95,
        },
      ],
    };
  }
}
