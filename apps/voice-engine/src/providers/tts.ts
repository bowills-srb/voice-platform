export interface TTSProvider {
  synthesize(text: string): Promise<Buffer>;
  synthesizeStream(text: string): AsyncIterable<Buffer>;
}

interface TTSConfig {
  voiceId: string;
  settings?: Record<string, unknown>;
}

export function createTTSProvider(provider: string, config: TTSConfig): TTSProvider {
  switch (provider) {
    case 'elevenlabs':
      return new ElevenLabsTTS(config);
    case 'cartesia':
      return new CartesiaTTS(config);
    case 'playht':
      return new PlayHTTTS(config);
    case 'openai':
      return new OpenAITTS(config);
    default:
      return new ElevenLabsTTS(config);
  }
}

class ElevenLabsTTS implements TTSProvider {
  private apiKey: string;
  private voiceId: string;
  private settings: Record<string, unknown>;

  constructor(config: TTSConfig) {
    this.apiKey = process.env.ELEVENLABS_API_KEY || '';
    this.voiceId = config.voiceId || '21m00Tcm4TlvDq8ikWAM'; // Rachel
    this.settings = config.settings || {};
  }

  async synthesize(text: string): Promise<Buffer> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}?output_format=pcm_24000`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2',
          voice_settings: {
            stability: this.settings.stability ?? 0.5,
            similarity_boost: this.settings.similarityBoost ?? 0.75,
          },
        }),
      }
    );

    if (!response.ok) {
      throw new Error(`ElevenLabs error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async *synthesizeStream(text: string): AsyncIterable<Buffer> {
    const response = await fetch(
      `https://api.elevenlabs.io/v1/text-to-speech/${this.voiceId}/stream?output_format=pcm_24000`,
      {
        method: 'POST',
        headers: {
          'xi-api-key': this.apiKey,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({
          text,
          model_id: 'eleven_turbo_v2',
          voice_settings: {
            stability: this.settings.stability ?? 0.5,
            similarity_boost: this.settings.similarityBoost ?? 0.75,
          },
        }),
      }
    );

    if (!response.ok || !response.body) {
      throw new Error(`ElevenLabs stream error: ${response.status}`);
    }

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield Buffer.from(value);
    }
  }
}

class CartesiaTTS implements TTSProvider {
  private apiKey: string;
  private voiceId: string;
  private settings: Record<string, unknown>;

  constructor(config: TTSConfig) {
    this.apiKey = process.env.CARTESIA_API_KEY || '';
    this.voiceId = config.voiceId || 'a0e99841-438c-4a64-b679-ae501e7d6091';
    this.settings = config.settings || {};
  }

  async synthesize(text: string): Promise<Buffer> {
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-english',
        transcript: text,
        voice: {
          mode: 'id',
          id: this.voiceId,
        },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: 16000,
        },
      }),
    });

    if (!response.ok) {
      throw new Error(`Cartesia error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async *synthesizeStream(text: string): AsyncIterable<Buffer> {
    // Cartesia supports WebSocket streaming for lower latency
    // For simplicity, using HTTP chunked response
    const response = await fetch('https://api.cartesia.ai/tts/bytes', {
      method: 'POST',
      headers: {
        'X-API-Key': this.apiKey,
        'Cartesia-Version': '2024-06-10',
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model_id: 'sonic-english',
        transcript: text,
        voice: {
          mode: 'id',
          id: this.voiceId,
        },
        output_format: {
          container: 'raw',
          encoding: 'pcm_s16le',
          sample_rate: 16000,
        },
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`Cartesia stream error: ${response.status}`);
    }

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield Buffer.from(value);
    }
  }
}

class PlayHTTTS implements TTSProvider {
  private apiKey: string;
  private userId: string;
  private voiceId: string;
  private settings: Record<string, unknown>;

  constructor(config: TTSConfig) {
    this.apiKey = process.env.PLAYHT_API_KEY || '';
    this.userId = process.env.PLAYHT_USER_ID || '';
    this.voiceId = config.voiceId;
    this.settings = config.settings || {};
  }

  async synthesize(text: string): Promise<Buffer> {
    const response = await fetch('https://api.play.ht/api/v2/tts', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'X-User-ID': this.userId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice: this.voiceId,
        output_format: 'mp3',
        speed: this.settings.speed ?? 1.0,
      }),
    });

    if (!response.ok) {
      throw new Error(`PlayHT error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async *synthesizeStream(text: string): AsyncIterable<Buffer> {
    const response = await fetch('https://api.play.ht/api/v2/tts/stream', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'X-User-ID': this.userId,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        text,
        voice: this.voiceId,
        output_format: 'mp3',
        speed: this.settings.speed ?? 1.0,
      }),
    });

    if (!response.ok || !response.body) {
      throw new Error(`PlayHT stream error: ${response.status}`);
    }

    const reader = response.body.getReader();

    while (true) {
      const { done, value } = await reader.read();
      if (done) break;
      yield Buffer.from(value);
    }
  }
}

class OpenAITTS implements TTSProvider {
  private apiKey: string;
  private voiceId: string;
  private settings: Record<string, unknown>;

  constructor(config: TTSConfig) {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.voiceId = config.voiceId || 'alloy';
    this.settings = config.settings || {};
  }

  async synthesize(text: string): Promise<Buffer> {
    const response = await fetch('https://api.openai.com/v1/audio/speech', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        model: 'tts-1',
        input: text,
        voice: this.voiceId,
        response_format: 'mp3',
        speed: this.settings.speed ?? 1.0,
      }),
    });

    if (!response.ok) {
      throw new Error(`OpenAI TTS error: ${response.status}`);
    }

    const arrayBuffer = await response.arrayBuffer();
    return Buffer.from(arrayBuffer);
  }

  async *synthesizeStream(text: string): AsyncIterable<Buffer> {
    // OpenAI TTS doesn't support streaming, return full audio
    const audio = await this.synthesize(text);
    yield audio;
  }
}
