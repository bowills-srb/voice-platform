import { WebSocket } from 'ws';
import { v4 as uuid } from 'uuid';
import { prisma, Assistant, Tool } from '@voice-platform/database';
import { CallMessage, ServerEvent } from '@voice-platform/shared';
import { STTProvider, createSTTProvider } from './providers/stt';
import { LLMProvider, createLLMProvider } from './providers/llm';
import { TTSProvider, createTTSProvider } from './providers/tts';
import { ToolExecutor } from './tools/executor';
import { logger } from './utils/logger';

interface SessionConfig {
  callId: string;
  orgId: string;
  assistant: Assistant;
  tools: Tool[];
  socket: WebSocket;
  onEnd: () => void;
}

interface Message {
  role: 'system' | 'user' | 'assistant' | 'tool';
  content: string;
  toolCallId?: string;
}

export class VoiceSession {
  private callId: string;
  private orgId: string;
  private assistant: Assistant;
  private socket: WebSocket;
  private onEnd: () => void;

  private stt: STTProvider;
  private llm: LLMProvider;
  private tts: TTSProvider;
  private toolExecutor: ToolExecutor;

  private messages: Message[] = [];
  private state: 'idle' | 'listening' | 'thinking' | 'speaking' = 'idle';
  private startTime: number = 0;
  private isEnded: boolean = false;
  private onSessionEnd?: () => void;

  // Audio buffering
  private audioBuffer: Buffer[] = [];
  private silenceStart: number = 0;
  private isSpeaking: boolean = false;

  // Synthesis tracking for interruption handling
  private currentSynthesisId: number = 0;

  // Recording
  private userAudioChunks: Buffer[] = [];
  private assistantAudioChunks: Buffer[] = [];

  // Metrics
  private metrics = {
    sttLatency: [] as number[],
    llmLatency: [] as number[],
    ttsLatency: [] as number[],
  };

  constructor(config: SessionConfig) {
    this.callId = config.callId;
    this.orgId = config.orgId;
    this.assistant = config.assistant;
    this.socket = config.socket;
    this.onEnd = config.onEnd;

    // Initialize providers
    this.stt = createSTTProvider(this.assistant.transcriberProvider, {
      model: this.assistant.transcriberModel,
      language: this.assistant.transcriberLanguage,
    });

    this.llm = createLLMProvider(this.assistant.modelProvider, {
      model: this.assistant.modelName,
      temperature: this.assistant.modelTemperature,
      maxTokens: this.assistant.modelMaxTokens,
    });

    this.tts = createTTSProvider(this.assistant.voiceProvider, {
      voiceId: this.assistant.voiceId,
    });

    this.toolExecutor = new ToolExecutor(config.tools);

    // Set up system prompt
    this.messages.push({
      role: 'system',
      content: this.assistant.systemPrompt,
    });
  }

  private setupSocketHandlers() {
    this.socket.on('message', async (data: Buffer | string) => {
      try {
        if (Buffer.isBuffer(data)) {
          await this.handleAudioData(data);
        } else {
          const message = JSON.parse(data.toString());
          await this.handleControlMessage(message);
        }
      } catch (error) {
        logger.error({ callId: this.callId, error }, 'Error handling message');
      }
    });

    this.socket.on('close', () => {
      if (!this.isEnded) {
        this.end('client-disconnect');
      }
    });

    this.socket.on('error', (error) => {
      logger.error({ callId: this.callId, error }, 'Socket error');
    });
  }

  private async handleControlMessage(message: any) {
    switch (message.type) {
      case 'end':
        await this.end('client-request');
        break;
      case 'interrupt':
        await this.handleInterrupt();
        break;
      case 'config':
        break;
    }
  }

  private async handleAudioData(data: Buffer) {
    if (this.isEnded) return;

    // Log occasionally to confirm audio is being received
    if (Math.random() < 0.01) {
      logger.info({ callId: this.callId, state: this.state, audioBytes: data.length, isSpeaking: this.isSpeaking }, 'Audio received');
    }

    // Always save user audio for recording
    this.userAudioChunks.push(data);

    // If we're speaking and interruption is enabled, check for interrupt
    if (this.state === 'speaking' && this.assistant.interruptionEnabled) {
      const hasVoice = this.detectVoiceActivity(data);
      if (hasVoice) {
        await this.handleInterrupt();
        // After interrupt, start buffering this audio for processing
        this.audioBuffer.push(data);
        this.isSpeaking = true;
        this.silenceStart = 0;
        this.sendEvent('speech.started', {});
      }
      return;
    }

    // Normal listening mode - buffer audio
    this.audioBuffer.push(data);

    // Voice activity detection
    const hasVoice = this.detectVoiceActivity(data);

    if (hasVoice) {
      if (!this.isSpeaking) {
        logger.info({ callId: this.callId }, 'Speech detected - user started speaking');
        this.sendEvent('speech.started', {});
      }
      this.isSpeaking = true;
      this.silenceStart = 0;
      if (this.state !== 'listening') {
        this.state = 'listening';
      }
    } else if (this.isSpeaking) {
      if (this.silenceStart === 0) {
        this.silenceStart = Date.now();
        logger.info({ callId: this.callId }, 'Silence started - waiting for timeout');
      }

      // Use 1200ms default if assistant setting is too high
      const silenceTimeout = Math.min(this.assistant.silenceTimeoutMs, 1200);
      const silenceDuration = Date.now() - this.silenceStart;

      if (silenceDuration > silenceTimeout) {
        logger.info({ callId: this.callId, silenceDuration }, 'Silence timeout - processing speech');
        this.isSpeaking = false;
        this.sendEvent('speech.ended', {});
        await this.processUserSpeech();
      }
    }
  }

  private detectVoiceActivity(audio: Buffer): boolean {
    let sum = 0;
    for (let i = 0; i < audio.length; i += 2) {
      const sample = audio.readInt16LE(i);
      sum += Math.abs(sample);
    }
    const avgEnergy = sum / (audio.length / 2);
    
    // Log every 50th packet to avoid spam
    if (Math.random() < 0.02) {
      logger.info({ callId: this.callId, avgEnergy, threshold: 200 }, 'VAD check');
    }
    
    return avgEnergy > 200;
  }

  private async handleInterrupt() {
    if (this.state !== 'speaking') return;

    logger.info({ callId: this.callId }, 'Interrupt detected');

    // Increment synthesis ID to invalidate current TTS stream
    this.currentSynthesisId++;
    
    // Transition to listening state
    this.state = 'listening';
    
    // Tell browser to stop playing audio immediately
    this.sendEvent('assistant.interrupted', { 
      clearAudio: true,
      reason: 'user-speech' 
    });
    
    // Clear any pending audio buffer on our side
    this.audioBuffer = [];
  }

  private async processUserSpeech() {
    if (this.audioBuffer.length === 0) return;

    const audioData = Buffer.concat(this.audioBuffer);
    this.audioBuffer = [];

    this.sendEvent('assistant.thinking', {});
    this.state = 'thinking';

    try {
      const sttStart = Date.now();
      const transcript = await this.stt.transcribe(audioData);
      const sttLatency = Date.now() - sttStart;
      this.metrics.sttLatency.push(sttLatency);

      if (!transcript || transcript.trim().length === 0) {
        this.state = 'listening';
        return;
      }

      logger.info({ callId: this.callId, transcript, sttLatency }, 'Transcribed');

      this.sendEvent('transcript.final', { text: transcript });

      this.messages.push({
        role: 'user',
        content: transcript,
      });

      await this.saveMessage({
        role: 'user',
        content: transcript,
        timestampMs: Date.now() - this.startTime,
        sttLatencyMs: sttLatency,
      });

      await this.generateResponse();

    } catch (error) {
      logger.error({ callId: this.callId, error }, 'STT error');
      this.state = 'listening';
    }
  }

  private async generateResponse() {
    const llmStart = Date.now();

    try {
      const response = await this.llm.generate(this.messages, this.toolExecutor.getToolDefinitions());
      const llmLatency = Date.now() - llmStart;
      this.metrics.llmLatency.push(llmLatency);

      logger.info({ callId: this.callId, llmLatency }, 'LLM response received');

      if (response.toolCalls && response.toolCalls.length > 0) {
        for (const toolCall of response.toolCalls) {
          await this.handleToolCall(toolCall);
        }
        await this.generateResponse();
        return;
      }

      if (response.content) {
        this.messages.push({
          role: 'assistant',
          content: response.content,
        });

        this.sendEvent('assistant.message', { text: response.content });

        await this.saveMessage({
          role: 'assistant',
          content: response.content,
          timestampMs: Date.now() - this.startTime,
          llmLatencyMs: llmLatency,
        });

        await this.synthesizeAndPlay(response.content, llmLatency);
      }

    } catch (error) {
      const errorMessage = error instanceof Error ? error.message : String(error);
      logger.error({ callId: this.callId, error: errorMessage }, 'LLM error');
      this.state = 'listening';
      this.sendEvent('assistant.audio.done', {});
    }
  }

  private async handleToolCall(toolCall: { id: string; name: string; arguments: Record<string, unknown> }) {
    logger.info({ callId: this.callId, toolCall }, 'Executing tool');

    this.sendEvent('tool.called', {
      name: toolCall.name,
      arguments: toolCall.arguments,
    });

    if (toolCall.name === 'endCall') {
      await this.end('assistant-ended');
      return;
    }

    if (toolCall.name === 'transferCall') {
      this.sendEvent('transfer.started', { destination: toolCall.arguments.number });
      return;
    }

    const result = await this.toolExecutor.execute(toolCall.name, toolCall.arguments);

    this.sendEvent('tool.result', {
      name: toolCall.name,
      result,
    });

    this.messages.push({
      role: 'tool',
      content: JSON.stringify(result),
      toolCallId: toolCall.id,
    });

    await this.saveMessage({
      role: 'tool',
      content: JSON.stringify(result),
      toolName: toolCall.name,
      toolArguments: toolCall.arguments,
      toolResult: result,
      timestampMs: Date.now() - this.startTime,
    });
  }

  private async synthesizeAndPlay(text: string, llmLatency: number) {
    this.state = 'speaking';
    const ttsStart = Date.now();

    // Track this specific synthesis - incremented on each new synthesis
    const synthesisId = ++this.currentSynthesisId;

    try {
      // Use non-streaming TTS for reliable browser playback
      const audioBuffer = await this.tts.synthesize(text);
      
      // Check if we've been interrupted
      if (this.state !== 'speaking' || this.currentSynthesisId !== synthesisId) {
        logger.info({ callId: this.callId }, 'TTS interrupted before playback');
        return;
      }

      const ttsLatency = Date.now() - ttsStart;
      this.metrics.ttsLatency.push(ttsLatency);
      logger.info({ callId: this.callId, ttsLatency, audioBytes: audioBuffer.length }, 'TTS complete');
      
      this.sendEvent('assistant.speaking', {});
      
      // Send complete audio to browser
      this.sendAudio(audioBuffer);

      // Store for recording
      this.assistantAudioChunks.push(audioBuffer);

      // Calculate playback duration for PCM 24kHz 16-bit mono
      // 24000 samples/sec * 2 bytes/sample = 48000 bytes/sec
      const audioDurationMs = Math.floor(audioBuffer.length / 48);
      
      // Wait for audio to finish playing before transitioning state
      const playbackDelay = Math.max(500, audioDurationMs + 200);
      
      setTimeout(() => {
        if (this.state === 'speaking' && this.currentSynthesisId === synthesisId) {
          this.state = 'listening';
          this.isSpeaking = false;
          this.audioBuffer = [];
          logger.info({ callId: this.callId }, 'Transitioned to listening state - ready for user input');
          this.sendEvent('assistant.audio.done', {});
        }
      }, playbackDelay);

    } catch (error) {
      logger.error({ callId: this.callId, error }, 'TTS error');
      if (this.state === 'speaking' && this.currentSynthesisId === synthesisId) {
        this.state = 'listening';
        this.sendEvent('assistant.audio.done', {});
      }
    }
  }

  async start() {
    this.startTime = Date.now();

    const sessionPromise = new Promise<void>((resolve) => {
      this.onSessionEnd = resolve;
    });

    this.sendEvent('call.started', {
      callId: this.callId,
      assistant: this.assistant.name,
    });

    await prisma.call.update({
      where: { id: this.callId },
      data: {
        status: 'active',
        startedAt: new Date(),
      },
    });

    this.setupSocketHandlers();
    this.state = 'listening';

    if (this.assistant.firstMessage) {
      this.messages.push({
        role: 'assistant',
        content: this.assistant.firstMessage,
      });

      this.sendEvent('assistant.message', { text: this.assistant.firstMessage });

      await this.saveMessage({
        role: 'assistant',
        content: this.assistant.firstMessage,
        timestampMs: 0,
      });

      await this.synthesizeAndPlay(this.assistant.firstMessage, 0);
    }

    await sessionPromise;
    logger.info({ callId: this.callId }, 'Session started');
  }

  async end(reason: string) {
    if (this.isEnded) return;
    this.isEnded = true;

    logger.info({ callId: this.callId, reason }, 'Ending session');

    const duration = Math.floor((Date.now() - this.startTime) / 1000);
    const costBreakdown = this.calculateCosts(duration);

    await prisma.call.update({
      where: { id: this.callId },
      data: {
        status: 'completed',
        endedReason: reason,
        endedAt: new Date(),
        durationSeconds: duration,
        costCents: costBreakdown.total,
        costBreakdown,
      },
    });

    this.sendEvent('call.ended', {
      reason,
      duration,
      costs: costBreakdown,
    });

    await this.saveRecording();

    this.socket.close();
    this.onEnd();
    this.onSessionEnd?.();
  }

  private calculateCosts(durationSeconds: number): Record<string, number> {
    const minutes = durationSeconds / 60;
    const sttCost = Math.round(minutes * 0.6);
    const llmCost = Math.round(minutes * 1.5);
    const ttsCost = Math.round(minutes * 1.5);
    const total = sttCost + llmCost + ttsCost;

    return { stt: sttCost, llm: llmCost, tts: ttsCost, total };
  }

  private sendEvent(type: string, data: unknown) {
    const event: ServerEvent = {
      type: type as any,
      data,
      timestamp: Date.now(),
    };

    logger.info({ callId: this.callId, event: event.type, readyState: this.socket.readyState }, 'sendEvent called');
    this.socket.send(JSON.stringify(event));
  }

  private sendAudio(audio: Buffer) {
    const state = this.socket.readyState;
    logger.info({ callId: this.callId, readyState: state, bytes: audio.length }, 'sendAudio called');
    if (state !== WebSocket.OPEN) {
      logger.warn({ callId: this.callId, readyState: state }, 'Socket not open');
      return;
    }
    try {
      this.assistantAudioChunks.push(audio);
      this.socket.send(audio);
      logger.info({ callId: this.callId }, 'Audio sent OK');
    } catch (err: any) {
      logger.error({ callId: this.callId, error: err.message }, 'Socket send error');
    }
  }

  private async saveMessage(message: {
    role: string;
    content: string;
    toolName?: string;
    toolArguments?: Record<string, unknown>;
    toolResult?: unknown;
    timestampMs: number;
    sttLatencyMs?: number;
    llmLatencyMs?: number;
    ttsLatencyMs?: number;
  }) {
    await prisma.callMessage.create({
      data: {
        callId: this.callId,
        role: message.role,
        content: message.content,
        toolName: message.toolName,
        toolArguments: message.toolArguments as any,
        toolResult: message.toolResult as any,
        timestampMs: message.timestampMs,
        sttLatencyMs: message.sttLatencyMs,
        llmLatencyMs: message.llmLatencyMs,
        ttsLatencyMs: message.ttsLatencyMs,
      },
    });
  }

  getInfo() {
    return {
      callId: this.callId,
      state: this.state,
      duration: Math.floor((Date.now() - this.startTime) / 1000),
      messageCount: this.messages.length,
      metrics: {
        avgSttLatency: this.avg(this.metrics.sttLatency),
        avgLlmLatency: this.avg(this.metrics.llmLatency),
        avgTtsLatency: this.avg(this.metrics.ttsLatency),
      },
    };
  }

  private avg(arr: number[]): number {
    if (arr.length === 0) return 0;
    return Math.round(arr.reduce((a, b) => a + b, 0) / arr.length);
  }

  private async saveRecording() {
    try {
      const fs = await import('fs/promises');
      const path = await import('path');
      const recordingsDir = path.join(process.cwd(), 'recordings');

      if (this.userAudioChunks.length > 0) {
        const userAudio = Buffer.concat(this.userAudioChunks);
        const userPath = path.join(recordingsDir, `${this.callId}-user.pcm`);
        await fs.writeFile(userPath, userAudio);
        logger.info({ callId: this.callId, size: userAudio.length }, 'User audio saved');
      }

      if (this.assistantAudioChunks.length > 0) {
        const assistantAudio = Buffer.concat(this.assistantAudioChunks);
        const assistantPath = path.join(recordingsDir, `${this.callId}-assistant.pcm`);
        await fs.writeFile(assistantPath, assistantAudio);
        logger.info({ callId: this.callId, size: assistantAudio.length }, 'Assistant audio saved');
      }

      await prisma.call.update({
        where: { id: this.callId },
        data: {
          recordingUrl: `/recordings/${this.callId}-user.pcm`,
          stereoRecordingUrl: `/recordings/${this.callId}-assistant.pcm`,
        },
      });

    } catch (error) {
      logger.error({ callId: this.callId, error }, 'Failed to save recording');
    }
  }
}
