# Voice AI Platform

A complete platform for building and deploying voice AI agents - a Vapi alternative that you own and control.

## Features

- **Voice Agents**: Create AI-powered voice assistants with custom prompts, voices, and behaviors
- **Multi-Provider Support**: Plug in any STT (Deepgram, AssemblyAI), LLM (OpenAI, Anthropic, Google, Groq), or TTS (ElevenLabs, Cartesia, PlayHT) provider
- **Phone Integration**: Inbound and outbound calling via Twilio or Telnyx
- **Web Widget**: Embed voice agents on any website
- **Tool/Function Calling**: Let agents make API calls, search knowledge bases, transfer calls
- **Knowledge Bases**: RAG-powered document search during calls
- **Squads**: Multi-agent systems with context-preserving transfers
- **Outbound Campaigns**: Batch calling with CSV upload
- **Analytics**: Track calls, latency, costs, and more
- **Webhooks**: Real-time event delivery
- **BYOK**: Bring your own API keys for any provider

## Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                        Dashboard                             │
│                    (Next.js / React)                        │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                         API Server                           │
│                    (Fastify / Node.js)                      │
│   Auth, Assistants, Calls, Phone Numbers, Webhooks, etc.   │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                       Voice Engine                           │
│                  (WebSocket / Real-time)                    │
│              STT → LLM → TTS Voice Pipeline                 │
└─────────────────────────────────────────────────────────────┘
                              │
                              ▼
┌─────────────────────────────────────────────────────────────┐
│                      AI Providers                            │
│   Deepgram, OpenAI, Anthropic, ElevenLabs, Cartesia, etc.  │
└─────────────────────────────────────────────────────────────┘
```

## Quick Start

### Prerequisites

- Node.js 20+
- pnpm 8+
- PostgreSQL 16+
- Redis 7+

### Installation

```bash
# Clone the repo
git clone https://github.com/your-org/voice-platform.git
cd voice-platform

# Install dependencies
pnpm install

# Copy environment variables
cp .env.example .env

# Edit .env with your API keys
nano .env

# Generate Prisma client
pnpm db:generate

# Run database migrations
pnpm db:migrate

# Start development servers
pnpm dev
```

### Using Docker

```bash
# Copy environment variables
cp .env.example .env

# Start all services
docker-compose up -d

# View logs
docker-compose logs -f
```

### Access the Platform

- **Dashboard**: http://localhost:3000
- **API**: http://localhost:4000
- **API Docs**: http://localhost:4000/docs
- **Voice Engine**: http://localhost:4001

## Project Structure

```
voice-platform/
├── apps/
│   ├── api/              # REST API server
│   ├── voice-engine/     # Real-time voice processing
│   └── dashboard/        # Next.js frontend
├── packages/
│   ├── database/         # Prisma schema and client
│   └── shared/           # Shared types and utilities
├── docker/               # Dockerfiles
├── docker-compose.yml
├── .env.example
└── README.md
```

## API Reference

### Authentication

All API requests require authentication via JWT token or API key:

```bash
# Using JWT (from login)
curl -H "Authorization: Bearer YOUR_JWT_TOKEN" ...

# Using API key
curl -H "x-api-key: vp_..." ...
```

### Create an Assistant

```bash
curl -X POST http://localhost:4000/v1/assistants \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "name": "Support Agent",
    "modelProvider": "anthropic",
    "modelName": "claude-3-haiku-20240307",
    "systemPrompt": "You are a helpful customer support agent...",
    "voiceProvider": "cartesia",
    "voiceId": "a0e99841-438c-4a64-b679-ae501e7d6091",
    "transcriberProvider": "deepgram"
  }'
```

### Make an Outbound Call

```bash
curl -X POST http://localhost:4000/v1/calls \
  -H "Authorization: Bearer YOUR_TOKEN" \
  -H "Content-Type: application/json" \
  -d '{
    "assistantId": "asst_...",
    "customer": {
      "number": "+1234567890"
    }
  }'
```

### List Calls

```bash
curl http://localhost:4000/v1/calls \
  -H "Authorization: Bearer YOUR_TOKEN"
```

## Configuring Providers

### STT Providers

| Provider | Environment Variable | Notes |
|----------|---------------------|-------|
| Deepgram | `DEEPGRAM_API_KEY` | Recommended, low latency |
| AssemblyAI | `ASSEMBLYAI_API_KEY` | Good accuracy |
| OpenAI | `OPENAI_API_KEY` | Uses Whisper |

### LLM Providers

| Provider | Environment Variable | Models |
|----------|---------------------|--------|
| OpenAI | `OPENAI_API_KEY` | gpt-4o, gpt-4o-mini |
| Anthropic | `ANTHROPIC_API_KEY` | claude-3-haiku, claude-3-sonnet |
| Google | `GOOGLE_API_KEY` | gemini-1.5-flash |
| Groq | `GROQ_API_KEY` | llama-3.1-8b-instant |

### TTS Providers

| Provider | Environment Variable | Notes |
|----------|---------------------|-------|
| ElevenLabs | `ELEVENLABS_API_KEY` | High quality voices |
| Cartesia | `CARTESIA_API_KEY` | Low latency |
| PlayHT | `PLAYHT_API_KEY`, `PLAYHT_USER_ID` | Good quality |
| OpenAI | `OPENAI_API_KEY` | Uses TTS-1 |

### Telephony Providers

| Provider | Environment Variables | Notes |
|----------|----------------------|-------|
| Twilio | `TWILIO_ACCOUNT_SID`, `TWILIO_AUTH_TOKEN` | Most popular |
| Telnyx | `TELNYX_API_KEY`, `TELNYX_CONNECTION_ID` | Cost effective |

## Webhook Events

Configure webhooks to receive real-time events:

```json
{
  "id": "evt_...",
  "type": "call.ended",
  "timestamp": "2024-01-15T12:00:00Z",
  "data": {
    "call": {
      "id": "call_...",
      "status": "completed",
      "durationSeconds": 120
    }
  }
}
```

### Event Types

- `call.started` - Call initiated
- `call.ringing` - Call is ringing
- `call.answered` - Call was answered
- `call.ended` - Call ended
- `transcript` - New transcript available
- `tool.called` - Tool was invoked
- `transfer.completed` - Call was transferred

## Cost Comparison

| Component | Vapi | This Platform |
|-----------|------|---------------|
| Platform fee | $0.05/min | $0 |
| STT (Deepgram) | $0.01/min | $0.0043/min |
| LLM (Haiku) | ~$0.02/min | ~$0.015/min |
| TTS (Cartesia) | $0.04/min | $0.04/min |
| Telephony | $0.01/min | $0.01/min |
| **Total** | **$0.13-0.15/min** | **$0.08-0.10/min** |

**Savings: 30-40% lower costs**

## Deployment

### Railway

1. Connect your GitHub repo to Railway
2. Add PostgreSQL and Redis services
3. Set environment variables
4. Deploy

### AWS/GCP

See `docker/` for Kubernetes deployment configs.

## Development

```bash
# Run all services in dev mode
pnpm dev

# Run specific service
pnpm --filter @voice-platform/api dev
pnpm --filter @voice-platform/voice-engine dev
pnpm --filter @voice-platform/dashboard dev

# Run database migrations
pnpm db:migrate

# Open Prisma Studio
pnpm db:studio

# Build all packages
pnpm build

# Lint
pnpm lint
```

## Contributing

1. Fork the repository
2. Create a feature branch
3. Make your changes
4. Run tests and linting
5. Submit a pull request

## License

MIT License - see LICENSE file for details.

## Support

- Documentation: [docs.your-domain.com](https://docs.your-domain.com)
- Discord: [discord.gg/your-server](https://discord.gg/your-server)
- Email: support@your-domain.com
