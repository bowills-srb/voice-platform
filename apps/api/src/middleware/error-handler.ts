import { FastifyError, FastifyReply, FastifyRequest } from 'fastify';
import { ZodError } from 'zod';
import { ErrorCodes } from '@voice-platform/shared';

export function errorHandler(error: FastifyError, request: FastifyRequest, reply: FastifyReply) {
  request.log.error(error);

  if (error instanceof ZodError) {
    return reply.status(400).send({
      success: false,
      error: {
        code: ErrorCodes.VALIDATION_ERROR,
        message: 'Validation failed',
        details: error.errors.map(e => ({ field: e.path.join('.'), message: e.message })),
      },
    });
  }

  if (error.name === 'PrismaClientKnownRequestError') {
    const prismaError = error as any;
    if (prismaError.code === 'P2002') {
      return reply.status(409).send({
        success: false,
        error: { code: ErrorCodes.ALREADY_EXISTS, message: 'Resource already exists' },
      });
    }
    if (prismaError.code === 'P2025') {
      return reply.status(404).send({
        success: false,
        error: { code: ErrorCodes.NOT_FOUND, message: 'Resource not found' },
      });
    }
  }

  if (error.statusCode) {
    return reply.status(error.statusCode).send({
      success: false,
      error: { code: (error as any).code || ErrorCodes.INTERNAL_ERROR, message: error.message },
    });
  }

  return reply.status(500).send({
    success: false,
    error: {
      code: ErrorCodes.INTERNAL_ERROR,
      message: process.env.NODE_ENV === 'production' ? 'Internal server error' : error.message,
    },
  });
}

export class ApiError extends Error {
  statusCode: number;
  code: string;

  constructor(statusCode: number, code: string, message: string) {
    super(message);
    this.statusCode = statusCode;
    this.code = code;
  }

  static badRequest(message: string) { return new ApiError(400, ErrorCodes.INVALID_INPUT, message); }
  static unauthorized(message = 'Unauthorized') { return new ApiError(401, ErrorCodes.UNAUTHORIZED, message); }
  static forbidden(message = 'Forbidden') { return new ApiError(403, ErrorCodes.FORBIDDEN, message); }
  static notFound(resource = 'Resource') { return new ApiError(404, ErrorCodes.NOT_FOUND, `${resource} not found`); }
  static conflict(message: string) { return new ApiError(409, ErrorCodes.ALREADY_EXISTS, message); }
  static quotaExceeded(message: string) { return new ApiError(402, ErrorCodes.QUOTA_EXCEEDED, message); }
}
