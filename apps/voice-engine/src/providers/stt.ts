export interface STTProvider {
  transcribe(audio: Buffer): Promise<string>;
  transcribeStream?(audioStream: AsyncIterable<Buffer>): AsyncIterable<string>;
}

interface STTConfig {
  model: string;
  language: string;
}

export function createSTTProvider(provider: string, config: STTConfig): STTProvider {
  switch (provider) {
    case 'deepgram':
      return new DeepgramSTT(config);
    case 'openai':
      return new OpenAIWhisper(config);
    case 'assemblyai':
      return new AssemblyAISTT(config);
    default:
      return new DeepgramSTT(config);
  }
}

class DeepgramSTT implements STTProvider {
  private apiKey: string;
  private model: string;
  private language: string;

  constructor(config: STTConfig) {
    this.apiKey = process.env.DEEPGRAM_API_KEY || '';
    this.model = config.model || 'nova-2';
    this.language = config.language || 'en';
  }

  async transcribe(audio: Buffer): Promise<string> {
    const response = await fetch(
      `https://api.deepgram.com/v1/listen?encoding=linear16&sample_rate=16000&model=${this.model}&language=${this.language}`,
      {
        method: 'POST',
        headers: {
          Authorization: `Token ${this.apiKey}`,
          'Content-Type': 'audio/raw',
        },
        body: audio,
      }
    );

    if (!response.ok) {
      throw new Error(`Deepgram error: ${response.status}`);
    }

    const result: any = await response.json();
    return result.results?.channels?.[0]?.alternatives?.[0]?.transcript || '';
  }

  async *transcribeStream(audioStream: AsyncIterable<Buffer>): AsyncIterable<string> {
    // For streaming, we'd use WebSocket connection
    // Simplified: batch process for now
    const chunks: Buffer[] = [];
    for await (const chunk of audioStream) {
      chunks.push(chunk);
    }
    const transcript = await this.transcribe(Buffer.concat(chunks));
    yield transcript;
  }
}

class OpenAIWhisper implements STTProvider {
  private apiKey: string;
  private model: string;

  constructor(config: STTConfig) {
    this.apiKey = process.env.OPENAI_API_KEY || '';
    this.model = 'whisper-1';
  }

  async transcribe(audio: Buffer): Promise<string> {
    const formData = new FormData();
    const blob = new Blob([audio], { type: 'audio/wav' });
    formData.append('file', blob, 'audio.wav');
    formData.append('model', this.model);

    const response = await fetch('https://api.openai.com/v1/audio/transcriptions', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${this.apiKey}`,
      },
      body: formData,
    });

    if (!response.ok) {
      throw new Error(`OpenAI Whisper error: ${response.status}`);
    }

    const result: any = await response.json();
    return result.text || '';
  }
}

class AssemblyAISTT implements STTProvider {
  private apiKey: string;

  constructor(config: STTConfig) {
    this.apiKey = process.env.ASSEMBLYAI_API_KEY || '';
  }

  async transcribe(audio: Buffer): Promise<string> {
    // Upload audio
    const uploadResponse = await fetch('https://api.assemblyai.com/v2/upload', {
      method: 'POST',
      headers: {
        Authorization: this.apiKey,
        'Content-Type': 'application/octet-stream',
      },
      body: audio,
    });

    if (!uploadResponse.ok) {
      throw new Error(`AssemblyAI upload error: ${uploadResponse.status}`);
    }

    const uploadResult: any = await uploadResponse.json();
    const upload_url = uploadResult.upload_url;

    // Create transcript
    const transcriptResponse = await fetch('https://api.assemblyai.com/v2/transcript', {
      method: 'POST',
      headers: {
        Authorization: this.apiKey,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ audio_url: upload_url }),
    });

    if (!transcriptResponse.ok) {
      throw new Error(`AssemblyAI transcript error: ${transcriptResponse.status}`);
    }

    const transcriptResult: any = await transcriptResponse.json();
    const id = transcriptResult.id;

    // Poll for result
    while (true) {
      const pollResponse = await fetch(`https://api.assemblyai.com/v2/transcript/${id}`, {
        headers: { Authorization: this.apiKey },
      });

      const result: any = await pollResponse.json();

      if (result.status === 'completed') {
        return result.text || '';
      } else if (result.status === 'error') {
        throw new Error(`AssemblyAI error: ${result.error}`);
      }

      await new Promise(resolve => setTimeout(resolve, 1000));
    }
  }
}
