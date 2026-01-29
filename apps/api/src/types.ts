// Type definitions to avoid implicit any errors when Prisma types aren't available

export interface CallRecord {
  id: string;
  type: string;
  status: string;
  fromNumber: string | null;
  toNumber: string | null;
  assistant: { id: string; name: string } | null;
  phoneNumber: { id: string; phoneNumber: string } | null;
  durationSeconds: number | null;
  costCents: number | null;
  endedReason: string | null;
  startedAt: Date | null;
  endedAt: Date | null;
  createdAt: Date;
}

export interface CallMessage {
  id: string;
  role: string;
  content: string | null;
  toolName: string | null;
  toolArguments: unknown;
  toolResult: unknown;
  timestampMs: number;
  sttLatencyMs: number | null;
  llmLatencyMs: number | null;
  ttsLatencyMs: number | null;
}

export interface AssistantRecord {
  id: string;
  name: string;
  modelProvider: string;
  modelName: string;
  voiceProvider: string;
  voiceId: string;
  transcriberProvider: string;
  isActive: boolean;
  createdAt: Date;
  updatedAt: Date;
  _count: { calls: number };
  tools: Array<{
    tool: { id: string; name: string; type: string };
  }>;
}

export interface AssistantTool {
  tool: { id: string; name: string; type: string };
}

export interface ToolRecord {
  id: string;
  name: string;
  type: string;
  description: string | null;
  functionDefinition: unknown;
  serverUrl: string | null;
  transferDestinations: unknown;
  transferMode: string | null;
  knowledgeBaseId: string | null;
  createdAt: Date;
  updatedAt: Date;
  _count: { assistants: number };
}

export interface WebhookRecord {
  id: string;
  url: string;
  events: string[];
  isActive: boolean;
  lastTriggeredAt: Date | null;
  failureCount: number;
  createdAt: Date;
  updatedAt: Date;
}

export interface PhoneNumberRecord {
  id: string;
  phoneNumber: string;
  phoneNumberE164: string;
  provider: string;
  countryCode: string | null;
  capabilities: string[];
  status: string;
  monthlyCostCents: number | null;
  createdAt: Date;
  inboundAssistant: { id: string; name: string } | null;
  inboundSquad: { id: string; name: string } | null;
  _count: { calls: number };
  fallbackNumber: string | null;
}

export interface CampaignRecord {
  id: string;
  name: string;
  status: string;
  totalContacts: number;
  callsCompleted: number;
  callsAnswered: number;
  callsVoicemail: number;
  callsFailed: number;
  scheduledAt: Date | null;
  startedAt: Date | null;
  completedAt: Date | null;
  createdAt: Date;
  assistant: { id: string; name: string } | null;
  phoneNumber: { id: string; phoneNumber: string } | null;
}

export interface UsageByType {
  usageType: string;
  _sum: {
    costCents: number | null;
    durationSeconds: number | null;
  };
}

export interface AssistantStat {
  assistantId: string | null;
  _count: number;
  _avg: { durationSeconds: number | null };
  _sum: { costCents: number | null; durationSeconds: number | null };
}

export interface AssistantStatResult {
  assistantId: string | null;
  assistantName: string;
  totalCalls: number;
  avgDurationSeconds: number;
  totalDurationMinutes: number;
  totalCostCents: number;
}
