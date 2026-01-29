import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@voice-platform/database';
import { randomBytes } from 'crypto';
import { authMiddleware, getOrgId, hasScope } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { WebhookRecord } from '../types';

export async function webhookRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'webhooks:read')) throw ApiError.forbidden('Missing webhooks:read scope');

    const webhooks = await prisma.webhook.findMany({ where: { orgId }, orderBy: { createdAt: 'desc' } });

    return reply.send({
      success: true,
      data: (webhooks as any[]).map((w) => ({
        id: w.id, url: w.url, events: w.events, isActive: w.isActive,
        lastTriggeredAt: w.lastTriggeredAt, failureCount: w.failureCount,
        createdAt: w.createdAt, updatedAt: w.updatedAt,
      })),
    });
  });

  app.post('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'webhooks:write')) throw ApiError.forbidden('Missing webhooks:write scope');

    const body = z.object({
      url: z.string().url(),
      events: z.array(z.string()).optional().default(['*']),
      secret: z.string().optional(),
    }).parse(request.body);

    const secret = body.secret || randomBytes(32).toString('hex');

    const webhook = await prisma.webhook.create({
      data: { orgId, url: body.url, events: body.events as any, secret },
    });

    return reply.status(201).send({
      success: true,
      data: { id: webhook.id, url: webhook.url, events: webhook.events, secret, isActive: webhook.isActive, createdAt: webhook.createdAt },
    });
  });

  app.get('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'webhooks:read')) throw ApiError.forbidden('Missing webhooks:read scope');

    const webhook = await prisma.webhook.findFirst({ where: { id, orgId } });
    if (!webhook) throw ApiError.notFound('Webhook');

    return reply.send({ success: true, data: webhook });
  });

  app.patch('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'webhooks:write')) throw ApiError.forbidden('Missing webhooks:write scope');

    const body = z.object({
      url: z.string().url().optional(),
      events: z.array(z.string()).optional(),
      isActive: z.boolean().optional(),
    }).parse(request.body);

    const existing = await prisma.webhook.findFirst({ where: { id, orgId } });
    if (!existing) throw ApiError.notFound('Webhook');

    const webhook = await prisma.webhook.update({ where: { id }, data: body as any });

    return reply.send({ success: true, data: webhook });
  });

  app.delete('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'webhooks:write')) throw ApiError.forbidden('Missing webhooks:write scope');

    await prisma.webhook.deleteMany({ where: { id, orgId } });

    return reply.send({ success: true, data: { deleted: true } });
  });

  app.get('/:id/logs', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    const { page = 1, limit = 20 } = request.query as { page?: number; limit?: number };
    if (!hasScope(request, 'webhooks:read')) throw ApiError.forbidden('Missing webhooks:read scope');

    const webhook = await prisma.webhook.findFirst({ where: { id, orgId } });
    if (!webhook) throw ApiError.notFound('Webhook');

    const skip = (page - 1) * limit;
    const [logs, total] = await Promise.all([
      prisma.webhookLog.findMany({ where: { webhookId: id }, skip, take: limit, orderBy: { createdAt: 'desc' } }),
      prisma.webhookLog.count({ where: { webhookId: id } }),
    ]);

    return reply.send({ success: true, data: logs, meta: { page, limit, total, hasMore: skip + logs.length < total } });
  });

  app.post('/:id/test', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'webhooks:write')) throw ApiError.forbidden('Missing webhooks:write scope');

    const webhook = await prisma.webhook.findFirst({ where: { id, orgId } });
    if (!webhook) throw ApiError.notFound('Webhook');

    const testPayload = { id: `test_${Date.now()}`, type: 'webhook.test', timestamp: new Date().toISOString(), data: { message: 'Test webhook event' } };

    const startTime = Date.now();
    let success = false, responseStatus = 0, responseBody = '', errorMessage = '';

    try {
      const response = await fetch(webhook.url, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(testPayload),
        signal: AbortSignal.timeout(10000),
      });
      responseStatus = response.status;
      responseBody = await response.text();
      success = response.ok;
    } catch (err: any) {
      errorMessage = err.message;
    }

    const responseTimeMs = Date.now() - startTime;

    await prisma.webhookLog.create({
      data: { webhookId: id, eventType: 'webhook.test', payload: testPayload, responseStatus, responseBody: responseBody.substring(0, 1000), responseTimeMs, success, errorMessage: errorMessage || null },
    });

    return reply.send({ success: true, data: { sent: true, responseStatus, responseTimeMs, success, errorMessage: errorMessage || null } });
  });
}
