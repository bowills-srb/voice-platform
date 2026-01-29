import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@voice-platform/database';
import { formatE164, formatPhoneDisplay } from '@voice-platform/shared';
import { authMiddleware, getOrgId, hasScope } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { PhoneNumberRecord } from '../types';

const importNumberSchema = z.object({
  phoneNumber: z.string(),
  provider: z.enum(['twilio', 'telnyx', 'vonage']),
  providerId: z.string().optional(),
  countryCode: z.string().optional().default('US'),
});

export async function phoneNumberRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'phone-numbers:read')) throw ApiError.forbidden('Missing phone-numbers:read scope');

    const numbers = await prisma.phoneNumber.findMany({
      where: { orgId },
      include: {
        inboundAssistant: { select: { id: true, name: true } },
        inboundSquad: { select: { id: true, name: true } },
        _count: { select: { calls: true } },
      },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({
      success: true,
      data: (numbers as any[]).map((n) => ({
        id: n.id, phoneNumber: n.phoneNumber, phoneNumberE164: n.phoneNumberE164,
        phoneNumberDisplay: formatPhoneDisplay(n.phoneNumberE164),
        provider: n.provider, countryCode: n.countryCode, capabilities: n.capabilities,
        inboundAssistant: n.inboundAssistant, inboundSquad: n.inboundSquad,
        fallbackNumber: n.fallbackNumber, status: n.status, callCount: n._count.calls,
        monthlyCostCents: n.monthlyCostCents, createdAt: n.createdAt,
      })),
    });
  });

  app.post('/import', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'phone-numbers:write')) throw ApiError.forbidden('Missing phone-numbers:write scope');

    const body = importNumberSchema.parse(request.body);
    const e164 = formatE164(body.phoneNumber, body.countryCode);

    const existing = await prisma.phoneNumber.findFirst({ where: { phoneNumberE164: e164 } });
    if (existing) throw ApiError.conflict('Phone number already imported');

    const org = await prisma.organization.findUnique({
      where: { id: orgId },
      include: { _count: { select: { phoneNumbers: true } } },
    });
    if (!org) throw ApiError.notFound('Organization');

    const limits: Record<string, number> = { free: 1, pro: 5, business: 20, enterprise: -1 };
    const limit = limits[org.planType] || 1;
    if (limit !== -1 && org._count.phoneNumbers >= limit) {
      throw ApiError.quotaExceeded(`Phone number limit reached for ${org.planType} plan`);
    }

    const phoneNumber = await prisma.phoneNumber.create({
      data: {
        orgId, phoneNumber: body.phoneNumber, phoneNumberE164: e164,
        provider: body.provider, providerId: body.providerId,
        countryCode: body.countryCode, capabilities: ['voice'],
      },
    });

    return reply.status(201).send({
      success: true,
      data: {
        id: phoneNumber.id, phoneNumber: phoneNumber.phoneNumber,
        phoneNumberE164: phoneNumber.phoneNumberE164,
        phoneNumberDisplay: formatPhoneDisplay(phoneNumber.phoneNumberE164),
        provider: phoneNumber.provider, status: phoneNumber.status, createdAt: phoneNumber.createdAt,
      },
    });
  });

  app.get('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'phone-numbers:read')) throw ApiError.forbidden('Missing phone-numbers:read scope');

    const number = await prisma.phoneNumber.findFirst({
      where: { id, orgId },
      include: {
        inboundAssistant: { select: { id: true, name: true } },
        inboundSquad: { select: { id: true, name: true } },
        _count: { select: { calls: true } },
      },
    });
    if (!number) throw ApiError.notFound('Phone number');

    return reply.send({ success: true, data: number });
  });

  app.patch('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'phone-numbers:write')) throw ApiError.forbidden('Missing phone-numbers:write scope');

    const body = z.object({
      inboundAssistantId: z.string().nullable().optional(),
      inboundSquadId: z.string().nullable().optional(),
      fallbackNumber: z.string().nullable().optional(),
    }).parse(request.body);

    const existing = await prisma.phoneNumber.findFirst({ where: { id, orgId } });
    if (!existing) throw ApiError.notFound('Phone number');

    if (body.inboundAssistantId) {
      const assistant = await prisma.assistant.findFirst({ where: { id: body.inboundAssistantId, orgId, isActive: true } });
      if (!assistant) throw ApiError.notFound('Assistant');
    }

    const number = await prisma.phoneNumber.update({
      where: { id },
      data: body,
      include: {
        inboundAssistant: { select: { id: true, name: true } },
        inboundSquad: { select: { id: true, name: true } },
      },
    });

    return reply.send({ success: true, data: number });
  });

  app.delete('/:id', async (request, reply) => {
    const orgId = getOrgId(request);
    const { id } = request.params as { id: string };
    if (!hasScope(request, 'phone-numbers:write')) throw ApiError.forbidden('Missing phone-numbers:write scope');

    await prisma.phoneNumber.updateMany({ where: { id, orgId }, data: { status: 'released' } });

    return reply.send({ success: true, data: { deleted: true } });
  });
}
