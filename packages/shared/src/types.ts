// API Types
export interface ApiResponse<T = unknown> {
  success: boolean;
  data?: T;
  error?: { code: string; message: string; details?: Record<string, unknown> };
  meta?: { page?: number; limit?: number; total?: number; hasMore?: boolean };
}

// Assistant Types
export interface AssistantConfig {
  id: string;
  name: string;
  model: { provider: string; name: string; temperature: number; maxTokens: number };
  voice: { provider: string; voiceId: string; settings?: Record<string, unknown> };
  transcriber: { provider: string; model: string; language: string };
  systemPrompt: string;
  firstMessage?: string;
  firstMessageMode: 'assistant-speaks-first' | 'assistant-waits-for-user';
  interruptionEnabled: boolean;
  silenceTimeoutMs: number;
  maxCallDurationSeconds: number;
  tools?: ToolConfig[];
}

export interface ToolConfig {
  id: string;
  name: string;
  type: 'function' | 'transfer' | 'query' | 'dtmf' | 'endCall';
  description?: string;
  function?: { name: string; description: string; parameters: Record<string, unknown> };
  serverUrl?: string;
  destinations?: { number: string; message?: string; description?: string }[];
  knowledgeBaseId?: string;
}

// Call Types
export type CallType = 'inbound' | 'outbound' | 'web';
export type CallStatus = 'queued' | 'ringing' | 'in-progress' | 'completed' | 'failed' | 'no-answer' | 'busy';

export interface CallMessage {
  id: string;
  role: 'user' | 'assistant' | 'system' | 'tool';
  content: string;
  toolName?: string;
  toolArguments?: Record<string, unknown>;
  toolResult?: unknown;
  timestampMs: number;
  latency?: { stt?: number; llm?: number; tts?: number };
}

// WebSocket Events
export type ClientEventType = 'audio' | 'config' | 'interrupt' | 'end';
export type ServerEventType = 'call.started' | 'call.ended' | 'speech.started' | 'speech.ended' | 'transcript.partial' | 'transcript.final' | 'assistant.thinking' | 'assistant.message' | 'audio' | 'tool.called' | 'tool.result' | 'error';

export interface ServerEvent {
  type: ServerEventType;
  data: unknown;
  timestamp: number;
}

// Webhook Events
export type WebhookEventType = 'assistant-request' | 'call.started' | 'call.ringing' | 'call.answered' | 'call.ended' | 'speech.started' | 'speech.ended' | 'transcript' | 'tool.called' | 'tool.result' | 'transfer.requested' | 'transfer.completed';

export interface WebhookPayload {
  id: string;
  type: WebhookEventType;
  timestamp: string;
  data: { call?: { id: string; orgId: string; type: CallType; status: CallStatus }; message?: CallMessage; [key: string]: unknown };
}

// Provider Types
export interface STTResult {
  transcript: string;
  confidence: number;
  isFinal: boolean;
}

export interface LLMMessage {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
}

export interface LLMResponse {
  content: string;
  toolCalls?: { id: string; name: string; arguments: Record<string, unknown> }[];
  usage?: { promptTokens: number; completionTokens: number };
}

// Error Codes
export const ErrorCodes = {
  UNAUTHORIZED: 'UNAUTHORIZED',
  FORBIDDEN: 'FORBIDDEN',
  INVALID_API_KEY: 'INVALID_API_KEY',
  VALIDATION_ERROR: 'VALIDATION_ERROR',
  INVALID_INPUT: 'INVALID_INPUT',
  NOT_FOUND: 'NOT_FOUND',
  ALREADY_EXISTS: 'ALREADY_EXISTS',
  RATE_LIMIT_EXCEEDED: 'RATE_LIMIT_EXCEEDED',
  QUOTA_EXCEEDED: 'QUOTA_EXCEEDED',
  CONCURRENT_CALL_LIMIT: 'CONCURRENT_CALL_LIMIT',
  PROVIDER_ERROR: 'PROVIDER_ERROR',
  CALL_FAILED: 'CALL_FAILED',
  INTERNAL_ERROR: 'INTERNAL_ERROR',
} as const;

export type ErrorCode = typeof ErrorCodes[keyof typeof ErrorCodes];
