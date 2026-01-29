import { FastifyRequest, FastifyReply } from 'fastify';
import { prisma } from '@voice-platform/database';
import { formatE164 } from '@voice-platform/shared';
import Twilio from 'twilio';
import { logger } from '../utils/logger';

const VoiceResponse = Twilio.twiml.VoiceResponse;

export class TelephonyRouter {
  private twilioClient?: Twilio.Twilio;
  private telnyxApiKey?: string;

  constructor() {
    if (process.env.TWILIO_ACCOUNT_SID?.startsWith('AC') && process.env.TWILIO_AUTH_TOKEN) {
      this.twilioClient = Twilio(
        process.env.TWILIO_ACCOUNT_SID,
        process.env.TWILIO_AUTH_TOKEN
      );
    }
    this.telnyxApiKey = process.env.TELNYX_API_KEY;
  }

  async handleTwilioInbound(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as {
      CallSid: string;
      From: string;
      To: string;
      CallStatus: string;
    };

    logger.info({ body }, 'Twilio inbound call');

    try {
      // Find phone number and get assigned assistant
      const phoneNumber = await prisma.phoneNumber.findFirst({
        where: {
          phoneNumberE164: formatE164(body.To),
          provider: 'twilio',
          status: 'active',
        },
        include: {
          inboundAssistant: true,
          inboundSquad: {
            include: { entryAssistant: true },
          },
          organization: true,
        },
      });

      if (!phoneNumber) {
        logger.warn({ to: body.To }, 'Phone number not found');
        const twiml = new VoiceResponse();
        twiml.say('This number is not configured. Goodbye.');
        twiml.hangup();
        return reply.type('text/xml').send(twiml.toString());
      }

      const assistant = phoneNumber.inboundAssistant || 
                       phoneNumber.inboundSquad?.entryAssistant;

      if (!assistant) {
        logger.warn({ phoneNumberId: phoneNumber.id }, 'No assistant configured');
        const twiml = new VoiceResponse();
        twiml.say('No assistant is configured for this number. Goodbye.');
        twiml.hangup();
        return reply.type('text/xml').send(twiml.toString());
      }

      // Create call record
      const call = await prisma.call.create({
        data: {
          orgId: phoneNumber.orgId,
          type: 'inbound',
          status: 'ringing',
          phoneNumberId: phoneNumber.id,
          fromNumber: body.From,
          toNumber: body.To,
          assistantId: assistant.id,
          squadId: phoneNumber.inboundSquadId,
          metadata: {
            twilioCallSid: body.CallSid,
          },
        },
      });

      // Return TwiML to connect to our WebSocket
      const wsUrl = `${process.env.VOICE_ENGINE_WS_URL}/ws/${call.id}`;

      const twiml = new VoiceResponse();
      const connect = twiml.connect();
      connect.stream({
        url: wsUrl,
        statusCallback: `${process.env.API_URL}/telephony/twilio/status`,
      });

      logger.info({ callId: call.id, wsUrl }, 'Connecting call to WebSocket');

      return reply.type('text/xml').send(twiml.toString());

    } catch (error) {
      logger.error({ error }, 'Twilio inbound error');
      const twiml = new VoiceResponse();
      twiml.say('An error occurred. Please try again later.');
      twiml.hangup();
      return reply.type('text/xml').send(twiml.toString());
    }
  }

  async handleTwilioStatus(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as {
      CallSid: string;
      CallStatus: string;
      CallDuration?: string;
    };

    logger.info({ body }, 'Twilio status callback');

    // Find call by Twilio SID
    const call = await prisma.call.findFirst({
      where: {
        metadata: {
          path: ['twilioCallSid'],
          equals: body.CallSid,
        },
      },
    });

    if (!call) {
      return reply.send({ ok: true });
    }

    // Map Twilio status to our status
    const statusMap: Record<string, string> = {
      'queued': 'queued',
      'ringing': 'ringing',
      'in-progress': 'in-progress',
      'completed': 'completed',
      'busy': 'failed',
      'failed': 'failed',
      'no-answer': 'no-answer',
      'canceled': 'failed',
    };

    const status = statusMap[body.CallStatus] || body.CallStatus;

    await prisma.call.update({
      where: { id: call.id },
      data: {
        status,
        ...(body.CallDuration ? { durationSeconds: parseInt(body.CallDuration) } : {}),
        ...(status === 'completed' || status === 'failed' ? { endedAt: new Date() } : {}),
      },
    });

    return reply.send({ ok: true });
  }

  async handleTelnyxInbound(request: FastifyRequest, reply: FastifyReply) {
    const body = request.body as {
      data: {
        event_type: string;
        payload: {
          call_control_id: string;
          call_leg_id: string;
          call_session_id: string;
          from: string;
          to: string;
          direction: string;
          state: string;
        };
      };
    };

    logger.info({ body }, 'Telnyx webhook');

    const { event_type, payload } = body.data;

    if (event_type === 'call.initiated') {
      // Find phone number
      const phoneNumber = await prisma.phoneNumber.findFirst({
        where: {
          phoneNumberE164: formatE164(payload.to),
          provider: 'telnyx',
          status: 'active',
        },
        include: {
          inboundAssistant: true,
          organization: true,
        },
      });

      if (!phoneNumber || !phoneNumber.inboundAssistant) {
        // Reject call
        await this.telnyxReject(payload.call_control_id);
        return reply.send({ ok: true });
      }

      // Answer call
      await this.telnyxAnswer(payload.call_control_id);

      // Create call record
      await prisma.call.create({
        data: {
          orgId: phoneNumber.orgId,
          type: 'inbound',
          status: 'ringing',
          phoneNumberId: phoneNumber.id,
          fromNumber: payload.from,
          toNumber: payload.to,
          assistantId: phoneNumber.inboundAssistantId!,
          metadata: {
            telnyxCallControlId: payload.call_control_id,
            telnyxCallSessionId: payload.call_session_id,
          },
        },
      });
    }

    return reply.send({ ok: true });
  }

  private async telnyxAnswer(callControlId: string) {
    await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/answer`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.telnyxApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({}),
    });
  }

  private async telnyxReject(callControlId: string) {
    await fetch(`https://api.telnyx.com/v2/calls/${callControlId}/actions/reject`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.telnyxApiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ cause: 'USER_BUSY' }),
    });
  }

  async initiateOutbound(params: {
    callId: string;
    from: string;
    to: string;
    provider: string;
  }): Promise<{ callSid?: string; callControlId?: string }> {
    const { callId, from, to, provider } = params;

    if (provider === 'twilio' && this.twilioClient) {
      const call = await this.twilioClient.calls.create({
        from,
        to,
        url: `${process.env.API_URL}/telephony/twilio/outbound-connected?callId=${callId}`,
        statusCallback: `${process.env.API_URL}/telephony/twilio/status`,
        statusCallbackEvent: ['initiated', 'ringing', 'answered', 'completed'],
      });

      return { callSid: call.sid };
    }

    if (provider === 'telnyx') {
      const response = await fetch('https://api.telnyx.com/v2/calls', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.telnyxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          connection_id: process.env.TELNYX_CONNECTION_ID,
          from,
          to,
          webhook_url: `${process.env.API_URL}/telephony/telnyx/inbound`,
        }),
      });

      const data = await response.json() as { data: { call_control_id: string } };
      return { callControlId: data.data.call_control_id };
    }

    throw new Error(`Unsupported provider: ${provider}`);
  }

  async hangup(callId: string, provider: string, externalId: string) {
    if (provider === 'twilio' && this.twilioClient) {
      await this.twilioClient.calls(externalId).update({ status: 'completed' });
    }

    if (provider === 'telnyx') {
      await fetch(`https://api.telnyx.com/v2/calls/${externalId}/actions/hangup`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.telnyxApiKey}`,
          'Content-Type': 'application/json',
        },
      });
    }
  }

  async transfer(callId: string, provider: string, externalId: string, to: string) {
    if (provider === 'twilio' && this.twilioClient) {
      const twiml = new VoiceResponse();
      twiml.dial(to);
      await this.twilioClient.calls(externalId).update({
        twiml: twiml.toString(),
      });
    }

    if (provider === 'telnyx') {
      await fetch(`https://api.telnyx.com/v2/calls/${externalId}/actions/transfer`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${this.telnyxApiKey}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({ to }),
      });
    }
  }
}
