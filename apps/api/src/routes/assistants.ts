import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@voice-platform/database';
import { authMiddleware, getOrgId, hasScope } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { AssistantRecord, AssistantTool } from '../types';

const createAssistantSchema = z.object({
  name: z.string().min(1).max(255),
  modelProvider: z.enum(['openai', 'anthropic', 'google', 'groq', 'together']),
  modelName: z.string(),
  modelTemperature: z.number().min(0).max(2).optional().default(0.7),
  modelMaxTokens: z.number().min(1).max(4096).optional().default(150),
  systemPrompt: z.string().min(1),
  firstMessage: z.string().optional(),
  firstMessageMode: z.enum(['assistant-speaks-first', 'assistant-waits-for-user']).optional().default('assistant-speaks-first'),
  voiceProvider: z.enum(['elevenlabs', 'cartesia', 'playht', 'openai', 'azure']),
  voiceId: z.string(),
  voiceSettings: z.record(z.unknown()).optional().default({}),
  transcriberProvider: z.enum(['deepgram', 'assemblyai', 'openai', 'azure', 'google']).optional().default('deepgram'),
  transcriberModel: z.string().optional().default('nova-2'),
  transcriberLanguage: z.string().optional().default('en'),
  interruptionEnabled: z.boolean().optional().default(true),
  fillerWordsEnabled: z.boolean().optional().default(false),
  silenceTimeoutMs: z.number().min(500).max(10000).optional().default(2000),
  maxCallDurationSeconds: z.number().min(60).max(7200).optional().default(1800),
  endpointingSensitivity: z.number().min(0).max(1).optional().default(0.5),
  endCallEnabled: z.boolean().optional().default(true),
  toolIds: z.array(z.string()).optional(),
  metadata: z.record(z.unknown()).optional().default({}),
});

export async function assistantRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'assistants:read')) throw ApiError.forbidden('Missing assistants:read scope');

    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
    const skip = (page - 1) * limit;

    const [assistants, total] = await Promise.all([
      prisma.assistant.findMany({
        where: { orgId, isActive: true },
        skip, take: limit,
        orderBy: { createdAt: 'desc' },
        include: { tools: { include: { tool: true } }, _count: { select: { calls: true } } },
      }),
      prisma.assistant.count({ where: { orgId, isActive: true } }),
    ]);

    return reply.send({
      success: true,
      data: assistants.map((a: AssistantRecord) => ({
        id: a.id, name: a.name, modelProvider: a.modelProvider, modelName: a.modelName,
        voiceProvider: a.voiceProvider, voiceId: a.voiceId, transcriberProvider: a.transcriberProvider,
        isActive: a.isActive, callCount: a._count.calls,
        tools: a.tools.map((t: AssistantTool) => ({ id: t.tool.id, name: t.tool.name, type: t.tool.type })),
        createdAt: a.createdAt, updatedAt: a.updatedAt,
      })),
      meta: { page, limit, total, hasMore: skip + assistants.length < total },
    });
  });

  app.post('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'assistants:write')) throw ApiError.forbidden('Missing assistants:write scope');

    const body = createAssistantSchema.parse(request.body);
    const { toolIds, ...data } = body;

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: { _count: { select: { assistants: true } } },
    });
    if (!org) throw ApiError.notFound('Organization');

    const limits: Record<string, number> = { free: 3, pro: 20, business: 100, enterprise: -1 };
    const limit = limits[org.planType] || 3;
    if (limit !== -1 && org._count.assistants >= limit) {
      throw ApiError.quotaExceeded(`Assistant limit reached for ${org.planType} plan`);
    }

    const assistant = await prisma.assistant.create({
      data: {
        ...(data as any), orgId,
        tools: toolIds?.length ? { create: toolIds.map(toolId => ({ toolId })) } : undefined,
      },
      include: { tools: { include: { tool: true } } },
    });

    return reply.status(201).send({ success: true, data: assistant });
  });

  app.get('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'assistants:read')) throw ApiError.forbidden('Missing assistants:read scope');

    const assistant = await prisma.assistant.findFirst({
      where: { id, orgId },
      include: { tools: { include: { tool: true } }, _count: { select: { calls: true } } },
    });
    if (!assistant) throw ApiError.notFound('Assistant');

    return reply.send({ success: true, data: assistant });
  });

  app.patch('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'assistants:write')) throw ApiError.forbidden('Missing assistants:write scope');

    const body = createAssistantSchema.partial().parse(request.body);
    const { toolIds, ...data } = body;

    const existing = await prisma.assistant.findFirst({ where: { id, orgId } });
    if (!existing) throw ApiError.notFound('Assistant');

    const assistant = await prisma.assistant.update({
      where: { id },
      data: {
        ...(data as any),
        tools: toolIds !== undefined ? { deleteMany: {}, create: toolIds.map(toolId => ({ toolId })) } : undefined,
      },
      include: { tools: { include: { tool: true } } },
    });

    return reply.send({ success: true, data: assistant });
  });

  app.delete('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'assistants:write')) throw ApiError.forbidden('Missing assistants:write scope');

    await prisma.assistant.updateMany({ where: { id, orgId }, data: { isActive: false } });

    return reply.send({ success: true, data: { deleted: true } });
  });
}
