import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@voice-platform/database';
import { authMiddleware, getOrgId, hasScope } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { CallRecord, CallMessage } from '../types';

const createCallSchema = z.object({
  type: z.enum(["web", "outbound", "inbound"]).optional(),
  assistantId: z.string().optional(),
  assistant: z.object({
    modelProvider: z.string(),
    modelName: z.string(),
    systemPrompt: z.string(),
    voiceProvider: z.string(),
    voiceId: z.string(),
  }).optional(),
  phoneNumberId: z.string().optional(),
  customer: z.object({
    number: z.string(),
    name: z.string().optional(),
  }).optional(),
  squadId: z.string().optional(),
  metadata: z.record(z.unknown()).optional(),
});

export async function callRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'calls:read')) throw ApiError.forbidden('Missing calls:read scope');

    const { page = 1, limit = 20, status, assistantId, type } = request.query as any;
    const skip = (page - 1) * limit;

    const where: any = { orgId };
    if (status) where.status = status;
    if (assistantId) where.assistantId = assistantId;
    if (type) where.type = type;

    const [calls, total] = await Promise.all([
      prisma.call.findMany({
        where, skip, take: Number(limit),
        orderBy: { createdAt: 'desc' },
        include: {
          assistant: { select: { id: true, name: true } },
          phoneNumber: { select: { id: true, phoneNumber: true } },
        },
      }),
      prisma.call.count({ where }),
    ]);

    return reply.send({
      success: true,
      data: calls.map((call: CallRecord) => ({
        id: call.id, type: call.type, status: call.status,
        fromNumber: call.fromNumber, toNumber: call.toNumber,
        assistant: call.assistant, phoneNumber: call.phoneNumber,
        durationSeconds: call.durationSeconds, costCents: call.costCents,
        endedReason: call.endedReason, startedAt: call.startedAt,
        endedAt: call.endedAt, createdAt: call.createdAt,
      })),
      meta: { page, limit, total, hasMore: skip + calls.length < total },
    });
  });

  app.post('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'calls:write')) throw ApiError.forbidden('Missing calls:write scope');

    const body = createCallSchema.parse(request.body);

    if (!body.assistantId && !body.assistant) {
      throw ApiError.badRequest('Either assistantId or assistant config is required');
    }
    if (!body.customer && body.type !== 'web') {
  throw ApiError.badRequest('customer is required for outbound calls');
}

    const org = await prisma.organization.findUnique({ where: { id: orgId } });
    if (!org) throw ApiError.notFound('Organization');

    const activeCalls = await prisma.call.count({
      where: { orgId, status: { in: ['queued', 'ringing', 'in-progress'] } },
    });
    if (activeCalls >= org.concurrentCallLimit) {
      throw ApiError.quotaExceeded(`Concurrent call limit (${org.concurrentCallLimit}) reached`);
    }

    let phoneNumber;
if (body.type !== 'web') {
  if (body.phoneNumberId) {
    phoneNumber = await prisma.phoneNumber.findFirst({ where: { id: body.phoneNumberId, orgId } });
    if (!phoneNumber) throw ApiError.notFound('Phone number');
  } else {
    phoneNumber = await prisma.phoneNumber.findFirst({ where: { orgId, status: 'active' } });
    if (!phoneNumber) throw ApiError.badRequest('No phone numbers available');
  }
}

    if (body.assistantId) {
      const assistant = await prisma.assistant.findFirst({ where: { id: body.assistantId, orgId, isActive: true } });
      if (!assistant) throw ApiError.notFound('Assistant');
    }

    const call = await prisma.call.create({
      data: {
        orgId, type: body.type || 'outbound', status: 'queued',
        phoneNumberId: phoneNumber?.id,
        fromNumber: phoneNumber?.phoneNumberE164,
        toNumber: body.customer?.number,
        assistantId: body.assistantId,
        squadId: body.squadId,
        metadata: (body.metadata || {}) as any,
      },
      include: {
        assistant: { select: { id: true, name: true } },
        phoneNumber: { select: { id: true, phoneNumber: true } },
      },
    });

    return reply.status(201).send({ success: true, data: call });
  });

  app.get('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'calls:read')) throw ApiError.forbidden('Missing calls:read scope');

    const call = await prisma.call.findFirst({
      where: { id, orgId },
      include: {
        assistant: { select: { id: true, name: true } },
        phoneNumber: { select: { id: true, phoneNumber: true } },
        messages: { orderBy: { timestampMs: 'asc' } },
      },
    });
    if (!call) throw ApiError.notFound('Call');

    return reply.send({
      success: true,
      data: {
        ...call,
        messages: call.messages.map((m: CallMessage) => ({
          id: m.id, role: m.role, content: m.content,
          toolName: m.toolName, toolArguments: m.toolArguments, toolResult: m.toolResult,
          timestampMs: m.timestampMs,
          latency: { stt: m.sttLatencyMs, llm: m.llmLatencyMs, tts: m.ttsLatencyMs },
        })),
      },
    });
  });

  app.get('/:id/transcript', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'calls:read')) throw ApiError.forbidden('Missing calls:read scope');

    const call = await prisma.call.findFirst({
      where: { id, orgId },
      include: { messages: { orderBy: { timestampMs: 'asc' }, select: { role: true, content: true, timestampMs: true } } },
    });
    if (!call) throw ApiError.notFound('Call');

    const transcript = call.messages
      .filter((m: { role: string }) => m.role === 'user' || m.role === 'assistant')
      .map((m: { role: string; content: string | null }) => `[${m.role.toUpperCase()}]: ${m.content}`)
      .join('\n\n');

    return reply.send({ success: true, data: { callId: call.id, messages: call.messages, transcript } });
  });

  app.post('/:id/end', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'calls:write')) throw ApiError.forbidden('Missing calls:write scope');

    const call = await prisma.call.findFirst({ where: { id, orgId } });
    if (!call) throw ApiError.notFound('Call');
    if (call.status === 'completed' || call.status === 'failed') {
      throw ApiError.badRequest('Call already ended');
    }

    const endedAt = new Date();
    const durationSeconds = call.startedAt ? Math.floor((endedAt.getTime() - call.startedAt.getTime()) / 1000) : 0;

    const updatedCall = await prisma.call.update({
      where: { id },
      data: { status: 'completed', endedReason: 'api-request', endedAt, durationSeconds },
    });

    return reply.send({ success: true, data: updatedCall });
  });
}
