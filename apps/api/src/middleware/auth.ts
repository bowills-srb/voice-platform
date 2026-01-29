import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@voice-platform/database';
import { hashApiKey } from '@voice-platform/shared';

export interface AuthUser {
  id: string;
  orgId: string;
  email: string;
  role: string;
}

export interface ApiKeyAuth {
  orgId: string;
  keyId: string;
  scopes: string[];
}

declare module 'fastify' {
  interface FastifyRequest {
    authUser?: AuthUser;
    apiKey?: ApiKeyAuth;
  }
}

export async function authMiddleware(
  request: FastifyRequest,
  reply: FastifyReply
): Promise<void> {
  const apiKeyHeader = request.headers['x-api-key'] as string;
  
  if (apiKeyHeader) {
    const keyHash = hashApiKey(apiKeyHeader);
    
    const apiKey = await prisma.apiKey.findFirst({
      where: {
        keyHash,
        OR: [
          { expiresAt: null },
          { expiresAt: { gt: new Date() } },
        ],
      },
      include: { organization: true },
    });
    
    if (!apiKey) {
      return reply.status(401).send({
        success: false,
        error: { code: 'INVALID_API_KEY', message: 'Invalid or expired API key' },
      });
    }
    
    await prisma.apiKey.update({
      where: { id: apiKey.id },
      data: { lastUsedAt: new Date() },
    });
    
    request.apiKey = {
      orgId: apiKey.orgId,
      keyId: apiKey.id,
      scopes: apiKey.scopes as string[],
    };
    return;
  }
  
  const authHeader = request.headers.authorization;
  
  if (!authHeader?.startsWith('Bearer ')) {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Missing or invalid authorization header' },
    });
  }
  
  try {
    const decoded = await request.jwtVerify<{ sub: string }>();
    
    const user = await prisma.user.findUnique({
      where: { id: decoded.sub },
      select: { id: true, orgId: true, email: true, role: true },
    });
    
    if (!user) {
      return reply.status(401).send({
        success: false,
        error: { code: 'UNAUTHORIZED', message: 'User not found' },
      });
    }
    
    request.authUser = user;
  } catch {
    return reply.status(401).send({
      success: false,
      error: { code: 'UNAUTHORIZED', message: 'Invalid or expired token' },
    });
  }
}

export function getOrgId(request: FastifyRequest): string {
  return request.authUser?.orgId || request.apiKey?.orgId || '';
}

export function hasScope(request: FastifyRequest, scope: string): boolean {
  if (request.authUser) return true;
  if (!request.apiKey) return false;
  const scopes = request.apiKey.scopes;
  return scopes.includes('*') || scopes.includes(scope);
}
