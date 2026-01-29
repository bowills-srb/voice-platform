import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@voice-platform/database';
import { authMiddleware, getOrgId, hasScope } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { CampaignRecord } from '../types';

export async function campaignRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'campaigns:read')) throw ApiError.forbidden('Missing campaigns:read scope');

    const campaigns = await prisma.campaign.findMany({
      where: { orgId },
      orderBy: { createdAt: 'desc' },
      include: {
        assistant: { select: { id: true, name: true } },
        phoneNumber: { select: { id: true, phoneNumber: true } },
      },
    });

    return reply.send({
      success: true,
      data: campaigns.map((c: CampaignRecord) => ({
        id: c.id, name: c.name, status: c.status, assistant: c.assistant, phoneNumber: c.phoneNumber,
        totalContacts: c.totalContacts, callsCompleted: c.callsCompleted, callsAnswered: c.callsAnswered,
        callsVoicemail: c.callsVoicemail, callsFailed: c.callsFailed,
        scheduledAt: c.scheduledAt, startedAt: c.startedAt, completedAt: c.completedAt, createdAt: c.createdAt,
      })),
    });
  });

  app.post('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'campaigns:write')) throw ApiError.forbidden('Missing campaigns:write scope');

    const body = z.object({
      name: z.string().min(1).max(255),
      assistantId: z.string(),
      phoneNumberId: z.string(),
      maxConcurrentCalls: z.number().min(1).max(100).optional().default(5),
      retryAttempts: z.number().min(0).max(5).optional().default(2),
      scheduledAt: z.string().datetime().optional(),
    }).parse(request.body);

    const assistant = await prisma.assistant.findFirst({ where: { id: body.assistantId, orgId, isActive: true } });
    if (!assistant) throw ApiError.notFound('Assistant');

    const phoneNumber = await prisma.phoneNumber.findFirst({ where: { id: body.phoneNumberId, orgId, status: 'active' } });
    if (!phoneNumber) throw ApiError.notFound('Phone number');

    const campaign = await prisma.campaign.create({
      data: {
        orgId, name: body.name, assistantId: body.assistantId, phoneNumberId: body.phoneNumberId,
        maxConcurrentCalls: body.maxConcurrentCalls, retryAttempts: body.retryAttempts,
        scheduledAt: body.scheduledAt ? new Date(body.scheduledAt) : null,
      },
      include: {
        assistant: { select: { id: true, name: true } },
        phoneNumber: { select: { id: true, phoneNumber: true } },
      },
    });

    return reply.status(201).send({ success: true, data: campaign });
  });

  app.get('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'campaigns:read')) throw ApiError.forbidden('Missing campaigns:read scope');

    const campaign = await prisma.campaign.findFirst({
      where: { id, orgId },
      include: {
        assistant: { select: { id: true, name: true } },
        phoneNumber: { select: { id: true, phoneNumber: true } },
      },
    });
    if (!campaign) throw ApiError.notFound('Campaign');

    return reply.send({ success: true, data: campaign });
  });

  app.post('/:id/contacts', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'campaigns:write')) throw ApiError.forbidden('Missing campaigns:write scope');

    const body = z.object({
      contacts: z.array(z.object({ phoneNumber: z.string(), variables: z.record(z.string()).optional() })),
    }).parse(request.body);

    const campaign = await prisma.campaign.findFirst({ where: { id, orgId } });
    if (!campaign) throw ApiError.notFound('Campaign');
    if (campaign.status !== 'draft') throw ApiError.badRequest('Cannot add contacts to a campaign that has started');

    await prisma.campaignContact.createMany({
      data: body.contacts.map(c => ({ campaignId: id, phoneNumber: c.phoneNumber, variables: c.variables || {} })),
    });

    const totalContacts = await prisma.campaignContact.count({ where: { campaignId: id } });
    await prisma.campaign.update({ where: { id }, data: { totalContacts } });

    return reply.status(201).send({ success: true, data: { added: body.contacts.length, totalContacts } });
  });

  app.get('/:id/contacts', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    const { page = 1, limit = 50, status } = request.query as any;
    if (!hasScope(request, 'campaigns:read')) throw ApiError.forbidden('Missing campaigns:read scope');

    const campaign = await prisma.campaign.findFirst({ where: { id, orgId } });
    if (!campaign) throw ApiError.notFound('Campaign');

    const skip = (page - 1) * limit;
    const where: any = { campaignId: id };
    if (status) where.status = status;

    const [contacts, total] = await Promise.all([
      prisma.campaignContact.findMany({
        where, skip, take: limit, orderBy: { createdAt: 'asc' },
        include: { call: { select: { id: true, status: true, durationSeconds: true } } },
      }),
      prisma.campaignContact.count({ where }),
    ]);

    return reply.send({ success: true, data: contacts, meta: { page, limit, total, hasMore: skip + contacts.length < total } });
  });

  app.post('/:id/start', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'campaigns:write')) throw ApiError.forbidden('Missing campaigns:write scope');

    const campaign = await prisma.campaign.findFirst({ where: { id, orgId } });
    if (!campaign) throw ApiError.notFound('Campaign');
    if (campaign.status !== 'draft' && campaign.status !== 'paused') throw ApiError.badRequest('Campaign cannot be started');
    if (campaign.totalContacts === 0) throw ApiError.badRequest('Campaign has no contacts');

    await prisma.campaign.update({ where: { id }, data: { status: 'running', startedAt: campaign.startedAt || new Date() } });

    return reply.send({ success: true, data: { status: 'running' } });
  });

  app.post('/:id/pause', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'campaigns:write')) throw ApiError.forbidden('Missing campaigns:write scope');

    const campaign = await prisma.campaign.findFirst({ where: { id, orgId } });
    if (!campaign) throw ApiError.notFound('Campaign');
    if (campaign.status !== 'running') throw ApiError.badRequest('Campaign is not running');

    await prisma.campaign.update({ where: { id }, data: { status: 'paused' } });

    return reply.send({ success: true, data: { status: 'paused' } });
  });

  app.delete('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'campaigns:write')) throw ApiError.forbidden('Missing campaigns:write scope');

    const campaign = await prisma.campaign.findFirst({ where: { id, orgId } });
    if (!campaign) throw ApiError.notFound('Campaign');
    if (campaign.status === 'running') throw ApiError.badRequest('Cannot delete a running campaign');

    await prisma.campaign.delete({ where: { id } });

    return reply.send({ success: true, data: { deleted: true } });
  });
}
