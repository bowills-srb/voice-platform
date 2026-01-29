// Provider Constants
export const STT_PROVIDERS = { DEEPGRAM: 'deepgram', ASSEMBLYAI: 'assemblyai', OPENAI: 'openai', AZURE: 'azure', GOOGLE: 'google' } as const;
export const LLM_PROVIDERS = { OPENAI: 'openai', ANTHROPIC: 'anthropic', GOOGLE: 'google', GROQ: 'groq', TOGETHER: 'together' } as const;
export const TTS_PROVIDERS = { ELEVENLABS: 'elevenlabs', CARTESIA: 'cartesia', PLAYHT: 'playht', OPENAI: 'openai', AZURE: 'azure' } as const;
export const TELEPHONY_PROVIDERS = { TWILIO: 'twilio', TELNYX: 'telnyx', VONAGE: 'vonage' } as const;

// Default Models
export const DEFAULT_MODELS = {
  openai: 'gpt-4o-mini',
  anthropic: 'claude-3-haiku-20240307',
  google: 'gemini-1.5-flash',
  groq: 'llama-3.1-8b-instant',
} as const;

export const DEFAULT_TTS_VOICES = {
  elevenlabs: '21m00Tcm4TlvDq8ikWAM',
  cartesia: 'a0e99841-438c-4a64-b679-ae501e7d6091',
  openai: 'alloy',
} as const;

// Limits
export const LIMITS = {
  FREE: { concurrentCalls: 2, monthlyMinutes: 100, assistants: 3, phoneNumbers: 1 },
  PRO: { concurrentCalls: 10, monthlyMinutes: 1000, assistants: 20, phoneNumbers: 5 },
  BUSINESS: { concurrentCalls: 50, monthlyMinutes: 5000, assistants: 100, phoneNumbers: 20 },
  ENTERPRISE: { concurrentCalls: -1, monthlyMinutes: -1, assistants: -1, phoneNumbers: -1 },
} as const;

// Pricing (cents per minute)
export const PRICING = {
  platform: 5,
  stt: { deepgram: 0.43, assemblyai: 0.65, openai: 0.60 },
  llm: { 'gpt-4o': 5, 'gpt-4o-mini': 0.5, 'claude-3-haiku': 0.5 },
  tts: { elevenlabs: 4.5, cartesia: 4, playht: 3.5, openai: 1.5 },
  telephony: { twilio: { inbound: 0.85, outbound: 1.4 }, telnyx: { inbound: 0.7, outbound: 1.0 } },
} as const;

// Audio Settings
export const AUDIO_SETTINGS = {
  sampleRate: 16000,
  channels: 1,
  bitDepth: 16,
  silenceThreshold: 0.01,
  silenceDurationMs: 1500,
  minSpeechDurationMs: 300,
  endpointingDelayMs: 500,
} as const;

// WebSocket Settings
export const WS_SETTINGS = {
  pingInterval: 30000,
  pongTimeout: 10000,
  maxMessageSize: 1024 * 1024,
} as const;

// Webhook Settings
export const WEBHOOK_SETTINGS = {
  timeout: 10000,
  maxRetries: 3,
  retryDelayMs: 1000,
} as const;
