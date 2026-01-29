export interface LLMResponse {
  content: string;
  toolCalls?: {
    id: string;
    name: string;
    arguments: Record<string, unknown>;
  }[];
  usage?: {
    promptTokens: number;
    completionTokens: number;
  };
}

export interface ToolDefinition {
  name: string;
  description: string;
  parameters: Record<string, unknown>;
}

export interface LLMProvider {
  generate(
    messages: { role: string; content: string; toolCallId?: string }[],
    tools?: ToolDefinition[]
  ): Promise<LLMResponse>;
  
  generateStream?(
    messages: { role: string; content: string }[],
    tools?: ToolDefinition[]
  ): AsyncIterable<string>;
}

interface LLMConfig {
  model: string;
  temperature: number;
  maxTokens: number;
}

export function createLLMProvider(provider: string, config: LLMConfig): LLMProvider {
  switch (provider) {
    case 'openai':
      return new OpenAILLM(config);
    case 'anthropic':
      return new AnthropicLLM(config);
    case 'google':
      return new GoogleLLM(config);
    case 'groq':
      return new GroqLLM(config);
    default:
      return new OpenAILLM(config);
  }
}

class OpenAILLM implements LLMProvider {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = config.model || 'gpt-4o-mini';
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens || 150;
  }

  async generate(
    messages: { role: string; content: string; toolCallId?: string }[],
    tools?: ToolDefinition[]
  ): Promise<LLMResponse> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages: messages.map(m => ({
        role: m.role === 'tool' ? 'tool' : m.role,
        content: m.content,
        ...(m.toolCallId ? { tool_call_id: m.toolCallId } : {}),
      })),
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`OpenAI error: ${response.status} - ${error}`);
    }

    const result: any = await response.json();
    const choice = result.choices[0];

    const llmResponse: LLMResponse = {
      content: choice.message.content || '',
      usage: result.usage ? {
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens,
      } : undefined,
    };

    if (choice.message.tool_calls) {
      llmResponse.toolCalls = choice.message.tool_calls.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      }));
    }

    return llmResponse;
  }

  async *generateStream(
    messages: { role: string; content: string }[],
    tools?: ToolDefinition[]
  ): AsyncIterable<string> {
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
      stream: true,
    };

    const response = await fetch('https://api.openai.com/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok || !response.body) {
      throw new Error(`OpenAI stream error: ${response.status}`);
    }

    const reader = response.body.getReader();
    const decoder = new TextDecoder();
    let buffer = '';

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;

      buffer += decoder.decode(value, { stream: true });
      const lines = buffer.split('\n');
      buffer = lines.pop() || '';

      for (const line of lines) {
        if (line.startsWith('data: ') && line !== 'data: [DONE]') {
          const data = JSON.parse(line.slice(6));
          const content = data.choices[0]?.delta?.content;
          if (content) yield content;
        }
      }
    }
  }
}

class AnthropicLLM implements LLMProvider {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    this.apiKey = process.env.ANTHROPIC_API_KEY || '';
    this.model = config.model || 'claude-3-haiku-20240307';
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens || 150;
    
    if (!this.apiKey) {
      console.error('WARNING: ANTHROPIC_API_KEY is not set!');
    } else {
      console.log(`Anthropic LLM initialized with model: ${this.model}, key starts with: ${this.apiKey.substring(0, 10)}...`);
    }
  }

  async generate(
    messages: { role: string; content: string; toolCallId?: string }[],
    tools?: ToolDefinition[]
  ): Promise<LLMResponse> {
    // Separate system message
    const systemMessage = messages.find(m => m.role === 'system');
    const otherMessages = messages.filter(m => m.role !== 'system');

    const body: Record<string, unknown> = {
      model: this.model,
      max_tokens: this.maxTokens,
      messages: otherMessages.map(m => ({
        role: m.role === 'tool' ? 'user' : m.role === 'assistant' ? 'assistant' : 'user',
        content: m.role === 'tool' ? `Tool result: ${m.content}` : m.content,
      })),
    };

    if (systemMessage) {
      body.system = systemMessage.content;
    }

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        name: t.name,
        description: t.description,
        input_schema: t.parameters,
      }));
    }

    const response = await fetch('https://api.anthropic.com/v1/messages', {
      method: 'POST',
      headers: {
        'x-api-key': this.apiKey,
        'anthropic-version': '2023-06-01',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Anthropic error: ${response.status} - ${error}`);
    }

    const result: any = await response.json();

    const llmResponse: LLMResponse = {
      content: '',
      usage: result.usage ? {
        promptTokens: result.usage.input_tokens,
        completionTokens: result.usage.output_tokens,
      } : undefined,
    };

    // Process content blocks
    for (const block of result.content) {
      if (block.type === 'text') {
        llmResponse.content += block.text;
      } else if (block.type === 'tool_use') {
        if (!llmResponse.toolCalls) llmResponse.toolCalls = [];
        llmResponse.toolCalls.push({
          id: block.id,
          name: block.name,
          arguments: block.input,
        });
      }
    }

    return llmResponse;
  }
}

class GoogleLLM implements LLMProvider {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    this.apiKey = process.env.GOOGLE_API_KEY || '';
    this.model = config.model || 'gemini-1.5-flash';
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens || 150;
  }

  async generate(
    messages: { role: string; content: string }[],
    tools?: ToolDefinition[]
  ): Promise<LLMResponse> {
    const contents = messages
      .filter(m => m.role !== 'system')
      .map(m => ({
        role: m.role === 'assistant' ? 'model' : 'user',
        parts: [{ text: m.content }],
      }));

    const systemInstruction = messages.find(m => m.role === 'system')?.content;

    const body: Record<string, unknown> = {
      contents,
      generationConfig: {
        temperature: this.temperature,
        maxOutputTokens: this.maxTokens,
      },
    };

    if (systemInstruction) {
      body.systemInstruction = { parts: [{ text: systemInstruction }] };
    }

    const response = await fetch(
      `https://generativelanguage.googleapis.com/v1beta/models/${this.model}:generateContent?key=${this.apiKey}`,
      {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      }
    );

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Google error: ${response.status} - ${error}`);
    }

    const result: any = await response.json();
    const content = result.candidates?.[0]?.content?.parts?.[0]?.text || '';

    return {
      content,
      usage: result.usageMetadata ? {
        promptTokens: result.usageMetadata.promptTokenCount,
        completionTokens: result.usageMetadata.candidatesTokenCount,
      } : undefined,
    };
  }
}

class GroqLLM implements LLMProvider {
  private apiKey: string;
  private model: string;
  private temperature: number;
  private maxTokens: number;

  constructor(config: LLMConfig) {
    this.apiKey = process.env.GROQ_API_KEY || '';
    this.model = config.model || 'llama-3.1-8b-instant';
    this.temperature = config.temperature ?? 0.7;
    this.maxTokens = config.maxTokens || 150;
  }

  async generate(
    messages: { role: string; content: string }[],
    tools?: ToolDefinition[]
  ): Promise<LLMResponse> {
    // Groq uses OpenAI-compatible API
    const body: Record<string, unknown> = {
      model: this.model,
      messages,
      temperature: this.temperature,
      max_tokens: this.maxTokens,
    };

    if (tools && tools.length > 0) {
      body.tools = tools.map(t => ({
        type: 'function',
        function: {
          name: t.name,
          description: t.description,
          parameters: t.parameters,
        },
      }));
    }

    const response = await fetch('https://api.groq.com/openai/v1/chat/completions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify(body),
    });

    if (!response.ok) {
      const error = await response.text();
      throw new Error(`Groq error: ${response.status} - ${error}`);
    }

    const result: any = await response.json();
    const choice = result.choices[0];

    return {
      content: choice.message.content || '',
      toolCalls: choice.message.tool_calls?.map((tc: any) => ({
        id: tc.id,
        name: tc.function.name,
        arguments: JSON.parse(tc.function.arguments),
      })),
      usage: result.usage ? {
        promptTokens: result.usage.prompt_tokens,
        completionTokens: result.usage.completion_tokens,
      } : undefined,
    };
  }
}
