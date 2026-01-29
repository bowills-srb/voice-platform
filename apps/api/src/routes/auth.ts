import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import bcrypt from 'bcryptjs';
import { prisma } from '@voice-platform/database';
import { generateUniqueSlug, generateApiKey } from '@voice-platform/shared';
import { authMiddleware } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';

const registerSchema = z.object({
  email: z.string().email(),
  password: z.string().min(8),
  name: z.string().min(1),
  organizationName: z.string().min(1),
});

const loginSchema = z.object({
  email: z.string().email(),
  password: z.string(),
});

export async function authRoutes(app: FastifyInstance) {
  app.post('/register', async (request, reply) => {
    const body = registerSchema.parse(request.body);

    const existingUser = await prisma.user.findUnique({ where: { email: body.email } });
    if (existingUser) throw ApiError.conflict('Email already registered');

    const passwordHash = await bcrypt.hash(body.password, 12);

    const organization = await prisma.organization.create({
      data: {
        name: body.organizationName,
        slug: generateUniqueSlug(body.organizationName),
        users: {
          create: { email: body.email, passwordHash, name: body.name, role: 'owner' },
        },
      },
      include: { users: true },
    });

    const user = organization.users[0];
    const token = app.jwt.sign({ sub: user.id }, { expiresIn: '7d' });

    return reply.status(201).send({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        organization: { id: organization.id, name: organization.name, slug: organization.slug },
      },
    });
  });

  app.post('/login', async (request, reply) => {
    const body = loginSchema.parse(request.body);

    const user = await prisma.user.findUnique({
      where: { email: body.email },
      include: { organization: true },
    });

    if (!user || !user.passwordHash) throw ApiError.unauthorized('Invalid email or password');

    const validPassword = await bcrypt.compare(body.password, user.passwordHash);
    if (!validPassword) throw ApiError.unauthorized('Invalid email or password');

    await prisma.user.update({ where: { id: user.id }, data: { lastLoginAt: new Date() } });

    const token = app.jwt.sign({ sub: user.id }, { expiresIn: '7d' });

    return reply.send({
      success: true,
      data: {
        token,
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug },
      },
    });
  });

  app.get('/me', { preHandler: [authMiddleware] }, async (request, reply) => {
    if (!request.authUser) throw ApiError.unauthorized();

    const user = await prisma.user.findUnique({
      where: { id: request.authUser.id },
      include: { organization: true },
    });

    if (!user) throw ApiError.notFound('User');

    return reply.send({
      success: true,
      data: {
        user: { id: user.id, email: user.email, name: user.name, role: user.role },
        organization: { id: user.organization.id, name: user.organization.name, slug: user.organization.slug, planType: user.organization.planType },
      },
    });
  });

  app.post('/api-keys', { preHandler: [authMiddleware] }, async (request, reply) => {
    if (!request.authUser) throw ApiError.unauthorized();

    const body = z.object({
      name: z.string().min(1),
      scopes: z.array(z.string()).optional(),
      expiresAt: z.string().datetime().optional(),
    }).parse(request.body);

    const { key, prefix, hash } = generateApiKey();

    const apiKey = await prisma.apiKey.create({
      data: {
        orgId: request.authUser.orgId,
        userId: request.authUser.id,
        name: body.name,
        keyHash: hash,
        keyPrefix: prefix,
        scopes: body.scopes || ['*'],
        expiresAt: body.expiresAt ? new Date(body.expiresAt) : null,
      },
    });

    return reply.status(201).send({
      success: true,
      data: { id: apiKey.id, name: apiKey.name, key, prefix: apiKey.keyPrefix, scopes: apiKey.scopes, createdAt: apiKey.createdAt },
    });
  });

  app.get('/api-keys', { preHandler: [authMiddleware] }, async (request, reply) => {
    if (!request.authUser) throw ApiError.unauthorized();

    const apiKeys = await prisma.apiKey.findMany({
      where: { orgId: request.authUser.orgId },
      select: { id: true, name: true, keyPrefix: true, scopes: true, lastUsedAt: true, expiresAt: true, createdAt: true },
      orderBy: { createdAt: 'desc' },
    });

    return reply.send({ success: true, data: apiKeys });
  });

  app.delete('/api-keys/:id', { preHandler: [authMiddleware] }, async (request, reply) => {
    if (!request.authUser) throw ApiError.unauthorized();
    const { id } = request.params as { id: string };

    await prisma.apiKey.deleteMany({ where: { id, orgId: request.authUser.orgId } });

    return reply.send({ success: true, data: { deleted: true } });
  });
}
