import 'dotenv/config';

import Fastify from 'fastify';
import websocket from '@fastify/websocket';
import cors from '@fastify/cors';
import { prisma } from '@voice-platform/database';
import { WebSocket } from 'ws';
import { VoiceSession } from './session';
import { TelephonyRouter } from './telephony/router';
import { logger } from './utils/logger';

const app = Fastify({ logger: true });

// Store active sessions
const sessions = new Map<string, VoiceSession>();

// Telephony router for inbound/outbound calls
const telephonyRouter = new TelephonyRouter();

async function start() {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
  });

  await app.register(websocket, {
    options: {
      maxPayload: 1024 * 1024, // 1MB
    },
  });

  // Health check
  app.get('/health', async () => ({
    status: 'ok',
    activeSessions: sessions.size,
    timestamp: new Date().toISOString(),
  }));

  // WebSocket endpoint for web calls
  app.register(async function (fastify) {
    fastify.get('/ws/:callId', { websocket: true }, async (connection, request) => {
  const socket = connection.socket;
  const { callId } = request.params as { callId: string };
  const apiKey = request.headers['x-api-key'] as string;

  logger.info({ callId }, 'WebSocket connection attempt');
  
  // Test: send immediately
  try {
    socket.send(JSON.stringify({ type: 'test', data: 'connected' }));
    logger.info({ callId }, 'Test message sent OK');
  } catch (err: any) {
    logger.error({ callId, error: err.message }, 'Test message FAILED');
  }

      try {
        // Validate call and get config
        const call = await prisma.call.findFirst({
          where: { id: callId },
          include: {
            assistant: {
              include: {
                tools: { include: { tool: true } },
              },
            },
            organization: true,
          },
        });

        if (!call) {
          socket.send(JSON.stringify({ type: 'error', data: { message: 'Call not found' } }));
          socket.close();
          return;
        }

        if (!call.assistant) {
          socket.send(JSON.stringify({ type: 'error', data: { message: 'No assistant configured' } }));
          socket.close();
          return;
        }

        // Create session
        const session = new VoiceSession({
          callId: call.id,
          orgId: call.orgId,
          assistant: call.assistant,
          tools: call.assistant.tools.map(t => t.tool),
          socket,
          onEnd: () => {
            sessions.delete(callId);
            logger.info({ callId }, 'Session ended');
          },
        });

        sessions.set(callId, session);

        // Update call status
        await prisma.call.update({
          where: { id: callId },
          data: {
            status: 'in-progress',
            startedAt: new Date(),
          },
        });

        // Start session
        await session.start();

        logger.info({ callId }, 'Session started');

      } catch (error) {
        logger.error({ callId, error }, 'Session error');
        socket.send(JSON.stringify({ type: 'error', data: { message: 'Session error' } }));
        socket.close();
      }
    });
  });

  // Twilio webhook for inbound calls
  app.post('/telephony/twilio/inbound', async (request, reply) => {
    return telephonyRouter.handleTwilioInbound(request, reply);
  });

  // Twilio status callback
  app.post('/telephony/twilio/status', async (request, reply) => {
    return telephonyRouter.handleTwilioStatus(request, reply);
  });

  // Telnyx webhook for inbound calls
  app.post('/telephony/telnyx/inbound', async (request, reply) => {
    return telephonyRouter.handleTelnyxInbound(request, reply);
  });

  // Create outbound call (internal API)
  app.post('/calls/outbound', async (request, reply) => {
    const body = request.body as {
      callId: string;
      from: string;
      to: string;
      provider: string;
    };

    try {
      const result = await telephonyRouter.initiateOutbound(body);
      return reply.send({ success: true, data: result });
    } catch (error: any) {
      return reply.status(500).send({
        success: false,
        error: { message: error.message },
      });
    }
  });

  // Get session info
  app.get('/sessions/:callId', async (request, reply) => {
    const { callId } = request.params as { callId: string };
    const session = sessions.get(callId);

    if (!session) {
      return reply.status(404).send({ success: false, error: { message: 'Session not found' } });
    }

    return reply.send({
      success: true,
      data: session.getInfo(),
    });
  });

  // End session
  app.post('/sessions/:callId/end', async (request, reply) => {
    const { callId } = request.params as { callId: string };
    const session = sessions.get(callId);

    if (!session) {
      return reply.status(404).send({ success: false, error: { message: 'Session not found' } });
    }

    await session.end('api-request');

    return reply.send({
      success: true,
      data: { ended: true },
    });
  });

  const port = parseInt(process.env.PORT || '4001');
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    logger.info(`Voice engine running at http://${host}:${port}`);
  } catch (err) {
    logger.error(err);
    process.exit(1);
  }
}

// Graceful shutdown
process.on('SIGINT', async () => {
  logger.info('Shutting down...');

  // End all sessions
  for (const [callId, session] of sessions) {
    await session.end('server-shutdown');
  }

  await app.close();
  await prisma.$disconnect();
  process.exit(0);
});

start();
