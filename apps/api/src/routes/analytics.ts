import { FastifyInstance } from 'fastify';
import { prisma } from '@voice-platform/database';
import { authMiddleware, getOrgId, hasScope } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';
import type { UsageByType, AssistantStat, AssistantStatResult } from '../types';

export async function analyticsRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/calls', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'analytics:read')) throw ApiError.forbidden('Missing analytics:read scope');

    const { from, to, assistantId } = request.query as { from?: string; to?: string; assistantId?: string };

    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const where: any = { orgId, createdAt: { gte: fromDate, lte: toDate } };
    if (assistantId) where.assistantId = assistantId;

    const [totalCalls, completedCalls, failedCalls, durationStats, costStats] = await Promise.all([
      prisma.call.count({ where }),
      prisma.call.count({ where: { ...where, status: 'completed' } }),
      prisma.call.count({ where: { ...where, status: 'failed' } }),
      prisma.call.aggregate({ where: { ...where, durationSeconds: { not: null } }, _avg: { durationSeconds: true }, _sum: { durationSeconds: true } }),
      prisma.call.aggregate({ where, _sum: { costCents: true } }),
    ]);

    const latencyStats = await prisma.callMessage.aggregate({
      where: { call: { orgId, createdAt: { gte: fromDate, lte: toDate } } },
      _avg: { sttLatencyMs: true, llmLatencyMs: true, ttsLatencyMs: true },
    });

    return reply.send({
      success: true,
      data: {
        summary: {
          totalCalls, completedCalls, failedCalls,
          successRate: totalCalls > 0 ? (completedCalls / totalCalls * 100).toFixed(1) : 0,
          avgDurationSeconds: Math.round(durationStats._avg.durationSeconds || 0),
          totalDurationMinutes: Math.round((durationStats._sum.durationSeconds || 0) / 60),
          totalCostCents: costStats._sum.costCents || 0,
          avgLatency: {
            stt: Math.round(latencyStats._avg.sttLatencyMs || 0),
            llm: Math.round(latencyStats._avg.llmLatencyMs || 0),
            tts: Math.round(latencyStats._avg.ttsLatencyMs || 0),
            total: Math.round((latencyStats._avg.sttLatencyMs || 0) + (latencyStats._avg.llmLatencyMs || 0) + (latencyStats._avg.ttsLatencyMs || 0)),
          },
        },
        period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      },
    });
  });

  app.get('/usage', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'analytics:read')) throw ApiError.forbidden('Missing analytics:read scope');

    const { from, to } = request.query as { from?: string; to?: string };
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const usageByType = await prisma.usageRecord.groupBy({
      by: ['usageType'],
      where: { orgId, periodStart: { gte: fromDate }, periodEnd: { lte: toDate } },
      _sum: { costCents: true, durationSeconds: true },
    });

    const total = await prisma.usageRecord.aggregate({
      where: { orgId, periodStart: { gte: fromDate }, periodEnd: { lte: toDate } },
      _sum: { costCents: true, durationSeconds: true },
    });

    const org = await prisma.organization.findUnique({ where: { id: orgId } });

    return reply.send({
      success: true,
      data: {
        byType: usageByType.map((u: UsageByType) => ({
          type: u.usageType,
          costCents: u._sum.costCents || 0,
          durationMinutes: Math.round((u._sum.durationSeconds || 0) / 60),
        })),
        total: {
          costCents: total._sum.costCents || 0,
          durationMinutes: Math.round((total._sum.durationSeconds || 0) / 60),
        },
        limits: {
          monthlyMinuteLimit: org?.monthlyMinuteLimit || 0,
          minutesUsed: Math.round((total._sum.durationSeconds || 0) / 60),
        },
        period: { from: fromDate.toISOString(), to: toDate.toISOString() },
      },
    });
  });

  app.get('/assistants', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'analytics:read')) throw ApiError.forbidden('Missing analytics:read scope');

    const { from, to } = request.query as { from?: string; to?: string };
    const fromDate = from ? new Date(from) : new Date(Date.now() - 30 * 24 * 60 * 60 * 1000);
    const toDate = to ? new Date(to) : new Date();

    const assistantStats = await prisma.call.groupBy({
      by: ['assistantId'],
      where: { orgId, assistantId: { not: null }, createdAt: { gte: fromDate, lte: toDate } },
      _count: true,
      _avg: { durationSeconds: true },
      _sum: { costCents: true, durationSeconds: true },
    });

    const assistantIds = assistantStats.map((s: AssistantStat) => s.assistantId!);
    const assistants = await prisma.assistant.findMany({
      where: { id: { in: assistantIds } },
      select: { id: true, name: true },
    });
    const assistantMap = new Map<string, string>(assistants.map((a: { id: string; name: string }) => [a.id, a.name]));

    return reply.send({
      success: true,
      data: assistantStats.map((s: AssistantStat): AssistantStatResult => ({
        assistantId: s.assistantId,
        assistantName: assistantMap.get(s.assistantId!) || 'Unknown',
        totalCalls: s._count,
        avgDurationSeconds: Math.round(s._avg.durationSeconds || 0),
        totalDurationMinutes: Math.round((s._sum.durationSeconds || 0) / 60),
        totalCostCents: s._sum.costCents || 0,
      })).sort((a: AssistantStatResult, b: AssistantStatResult) => b.totalCalls - a.totalCalls),
    });
  });
}
