import { FastifyInstance } from 'fastify';
import { z } from 'zod';
import { prisma } from '@voice-platform/database';
import { createCipheriv, createDecipheriv, randomBytes } from 'crypto';
import { authMiddleware, getOrgId, hasScope } from '../middleware/auth';
import { ApiError } from '../middleware/error-handler';

const ENCRYPTION_KEY = process.env.ENCRYPTION_KEY || randomBytes(32).toString('hex');
const IV_LENGTH = 16;

function encrypt(text: string): Buffer {
  const iv = randomBytes(IV_LENGTH);
  const cipher = createCipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  return Buffer.concat([iv, cipher.update(text, 'utf8'), cipher.final()]);
}

function decrypt(encrypted: Buffer): string {
  const iv = encrypted.slice(0, IV_LENGTH);
  const decipher = createDecipheriv('aes-256-cbc', Buffer.from(ENCRYPTION_KEY, 'hex'), iv);
  return decipher.update(encrypted.slice(IV_LENGTH)) + decipher.final('utf8');
}

const providers = ['openai', 'anthropic', 'google', 'groq', 'together', 'elevenlabs', 'cartesia', 'playht', 'deepgram', 'assemblyai', 'twilio', 'telnyx', 'vonage'] as const;

export async function credentialRoutes(app: FastifyInstance) {
  app.addHook('preHandler', authMiddleware);

  app.get('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'credentials:read')) throw ApiError.forbidden('Missing credentials:read scope');

    const credentials = await prisma.providerCredential.findMany({
      where: { orgId },
      select: { id: true, provider: true, isActive: true, createdAt: true, updatedAt: true },
    });

    return reply.send({ success: true, data: credentials });
  });

  app.post('/', async (request, reply) => {
    const orgId = getOrgId(request);
    if (!hasScope(request, 'credentials:write')) throw ApiError.forbidden('Missing credentials:write scope');

    const body = z.object({ provider: z.enum(providers), credentials: z.record(z.string()) }).parse(request.body);
    const encrypted = encrypt(JSON.stringify(body.credentials));

    const credential = await prisma.providerCredential.upsert({
      where: { orgId_provider: { orgId, provider: body.provider } },
      create: { orgId, provider: body.provider, credentialsEncrypted: encrypted },
      update: { credentialsEncrypted: encrypted, isActive: true },
    });

    return reply.status(201).send({ success: true, data: { id: credential.id, provider: credential.provider, isActive: credential.isActive, updatedAt: credential.updatedAt } });
  });

  app.get('/:provider', async (request, reply) => {
    const orgId = getOrgId(request);
    const { provider } = request.params as { provider: string };
    if (!hasScope(request, 'credentials:read')) throw ApiError.forbidden('Missing credentials:read scope');

    const credential = await prisma.providerCredential.findFirst({ where: { orgId, provider } });
    if (!credential) throw ApiError.notFound('Credential');

    const decrypted = JSON.parse(decrypt(credential.credentialsEncrypted));
    const masked: Record<string, string> = {};
    for (const [key, value] of Object.entries(decrypted)) {
      const val = value as string;
      masked[key] = val.length > 8 ? val.substring(0, 4) + '****' + val.substring(val.length - 4) : '****';
    }

    return reply.send({ success: true, data: { id: credential.id, provider: credential.provider, credentials: masked, isActive: credential.isActive, updatedAt: credential.updatedAt } });
  });

  app.delete('/:provider', async (request, reply) => {
    const orgId = getOrgId(request);
    const { provider } = request.params as { provider: string };
    if (!hasScope(request, 'credentials:write')) throw ApiError.forbidden('Missing credentials:write scope');

    await prisma.providerCredential.deleteMany({ where: { orgId, provider } });

    return reply.send({ success: true, data: { deleted: true } });
  });

  app.post('/:provider/test', async (request, reply) => {
    const orgId = getOrgId(request);
    const { provider } = request.params as { provider: string };
    if (!hasScope(request, 'credentials:write')) throw ApiError.forbidden('Missing credentials:write scope');

    const credential = await prisma.providerCredential.findFirst({ where: { orgId, provider } });
    if (!credential) throw ApiError.notFound('Credential');

    const decrypted = JSON.parse(decrypt(credential.credentialsEncrypted));
    let valid = false, error = '';

    try {
      switch (provider) {
        case 'openai':
          const res = await fetch('https://api.openai.com/v1/models', { headers: { Authorization: `Bearer ${decrypted.apiKey}` } });
          valid = res.ok;
          break;
        case 'anthropic':
          valid = decrypted.apiKey?.startsWith('sk-ant-');
          break;
        case 'deepgram':
          const dgRes = await fetch('https://api.deepgram.com/v1/projects', { headers: { Authorization: `Token ${decrypted.apiKey}` } });
          valid = dgRes.ok;
          break;
        case 'elevenlabs':
          const elRes = await fetch('https://api.elevenlabs.io/v1/user', { headers: { 'xi-api-key': decrypted.apiKey } });
          valid = elRes.ok;
          break;
        default:
          valid = true;
      }
    } catch (err: any) {
      error = err.message;
    }

    return reply.send({ success: true, data: { provider, valid, error: error || null } });
  });
}
