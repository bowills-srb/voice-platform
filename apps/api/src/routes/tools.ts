import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@voice-platform/database';
import { authMiddleware, getOrgId, hasScope } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { ToolRecord } from '../types';

const createToolSchema = z.object({
  name: z.string().min(1).max(100),
  type: z.enum(['function', 'transfer', 'query', 'dtmf', 'endCall']),
  description: z.string().optional(),
  functionDefinition: z.object({ name: z.string(), description: z.string(), parameters: z.record(z.unknown()) }).optional(),
  serverUrl: z.string().url().optional(),
  transferDestinations: z.array(z.object({ number: z.string(), message: z.string().optional(), description: z.string().optional() })).optional(),
  transferMode: z.enum(['blind', 'warm-summary', 'warm-message']).optional(),
  knowledgeBaseId: z.string().optional(),
});

export async function toolRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'tools:read')) throw ApiError.forbidden('Missing tools:read scope');

    const tools = await prisma.tool.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: { _count: { select: { assistants: true } } },
    });

    return reply.send({
      success: true,
      data: tools.map((t: ToolRecord) => ({
        id: t.id, name: t.name, type: t.type, description: t.description,
        functionDefinition: t.functionDefinition, serverUrl: t.serverUrl,
        transferDestinations: t.transferDestinations, transferMode: t.transferMode,
        knowledgeBaseId: t.knowledgeBaseId, assistantCount: t._count.assistants,
        createdAt: t.createdAt, updatedAt: t.updatedAt,
      })),
    });
  });

  app.post('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'tools:write')) throw ApiError.forbidden('Missing tools:write scope');

    const body = createToolSchema.parse(request.body);

    if (body.type === 'function' && !body.functionDefinition) {
      throw ApiError.badRequest('functionDefinition required for function tools');
    }
    if (body.type === 'transfer' && !body.transferDestinations?.length) {
      throw ApiError.badRequest('transferDestinations required for transfer tools');
    }
    if (body.type === 'query' && !body.knowledgeBaseId) {
      throw ApiError.badRequest('knowledgeBaseId required for query tools');
    }

    if (body.knowledgeBaseId) {
      const kb = await prisma.knowledgeBase.findFirst({ where: { id: body.knowledgeBaseId, orgId } });
      if (!kb) throw ApiError.notFound('Knowledge base');
    }

    const tool = await prisma.tool.create({ data: { orgId, ...body } as any });

    return reply.status(201).send({ success: true, data: tool });
  });

  app.get('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'tools:read')) throw ApiError.forbidden('Missing tools:read scope');

    const tool = await prisma.tool.findFirst({
      where: { id, orgId },
      include: {
        knowledgeBase: { select: { id: true, name: true } },
        assistants: { include: { assistant: { select: { id: true, name: true } } } },
      },
    });
    if (!tool) throw ApiError.notFound('Tool');

    return reply.send({ success: true, data: { ...tool, assistants: tool.assistants.map((a: { assistant: { id: string; name: string } }) => a.assistant) } });
  });

  app.patch('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'tools:write')) throw ApiError.forbidden('Missing tools:write scope');

    const body = createToolSchema.partial().parse(request.body);

    const existing = await prisma.tool.findFirst({ where: { id, orgId } });
    if (!existing) throw ApiError.notFound('Tool');

    const tool = await prisma.tool.update({ where: { id }, data: body as any });

    return reply.send({ success: true, data: tool });
  });

  app.delete('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'tools:write')) throw ApiError.forbidden('Missing tools:write scope');

    await prisma.tool.deleteMany({ where: { id, orgId } });

    return reply.send({ success: true, data: { deleted: true } });
  });
}
