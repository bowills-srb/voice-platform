import Fastify from 'fastify';
import cors from '@fastify/cors';
import helmet from '@fastify/helmet';
import jwt from '@fastify/jwt';
import rateLimit from '@fastify/rate-limit';
import swagger from '@fastify/swagger';
import swaggerUi from '@fastify/swagger-ui';
import websocket from '@fastify/websocket';

import { prisma } from '@voice-platform/database';
import { ErrorCodes } from '@voice-platform/shared';

import { authRoutes } from './routes/auth';
import { assistantRoutes } from './routes/assistants';
import { callRoutes } from './routes/calls';
import { phoneNumberRoutes } from './routes/phone-numbers';
import { webhookRoutes } from './routes/webhooks';
import { analyticsRoutes } from './routes/analytics';
import { toolRoutes } from './routes/tools';
import { campaignRoutes } from './routes/campaigns';
import { credentialRoutes } from './routes/credentials';

import { authMiddleware } from './middleware/auth';
import { errorHandler } from './middleware/error-handler';

const app = Fastify({
  logger: {
    level: process.env.LOG_LEVEL || 'info',
    transport: process.env.NODE_ENV === 'development' 
      ? { target: 'pino-pretty' } 
      : undefined,
  },
});

async function start() {
  await app.register(cors, {
    origin: process.env.CORS_ORIGIN?.split(',') || ['http://localhost:3000'],
    credentials: true,
  });

  await app.register(helmet);
  
  await app.register(jwt, {
    secret: process.env.JWT_SECRET || 'your-secret-key-change-in-production',
  });

  await app.register(rateLimit, {
    max: 100,
    timeWindow: '1 minute',
  });

  await app.register(websocket);

  await app.register(swagger, {
    openapi: {
      info: {
        title: 'Voice AI Platform API',
        description: 'API for building and deploying voice AI agents',
        version: '1.0.0',
      },
      servers: [
        { url: process.env.API_URL || 'http://localhost:4000' },
      ],
      components: {
        securitySchemes: {
          bearerAuth: {
            type: 'http',
            scheme: 'bearer',
            bearerFormat: 'JWT',
          },
          apiKey: {
            type: 'apiKey',
            in: 'header',
            name: 'x-api-key',
          },
        },
      },
    },
  });

  await app.register(swaggerUi, {
    routePrefix: '/docs',
  });

  app.decorate('prisma', prisma);
  app.decorate('authenticate', authMiddleware);

  app.setErrorHandler(errorHandler);

  app.get('/health', async () => ({ status: 'ok', timestamp: new Date().toISOString() }));

  app.register(authRoutes, { prefix: '/v1/auth' });
  app.register(assistantRoutes, { prefix: '/v1/assistants' });
  app.register(callRoutes, { prefix: '/v1/calls' });
  app.register(phoneNumberRoutes, { prefix: '/v1/phone-numbers' });
  app.register(webhookRoutes, { prefix: '/v1/webhooks' });
  app.register(analyticsRoutes, { prefix: '/v1/analytics' });
  app.register(toolRoutes, { prefix: '/v1/tools' });
  app.register(campaignRoutes, { prefix: '/v1/campaigns' });
  app.register(credentialRoutes, { prefix: '/v1/credentials' });

  const port = parseInt(process.env.PORT || '4000');
  const host = process.env.HOST || '0.0.0.0';

  try {
    await app.listen({ port, host });
    app.log.info(`Server running at http://${host}:${port}`);
    app.log.info(`API docs at http://${host}:${port}/docs`);
  } catch (err) {
    app.log.error(err);
    process.exit(1);
  }
}

const signals = ['SIGINT', 'SIGTERM'];
signals.forEach((signal) => {
  process.on(signal, async () => {
    app.log.info(`Received ${signal}, shutting down...`);
    await app.close();
    await prisma.$disconnect();
    process.exit(0);
  });
});

start();

export { app };
