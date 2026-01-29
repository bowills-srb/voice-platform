/**
 * Voice AI Platform - Web Widget SDK
 * Embed voice AI agents on any website
 * 
 * Usage:
 *   <script src="https://cdn.voiceai.com/widget.js"></script>
 *   <script>
 *     VoiceAI.init({
 *       apiKey: 'your-api-key',
 *       assistantId: 'your-assistant-id',
 *       position: 'bottom-right',
 *     });
 *   </script>
 */

interface VoiceAIConfig {
  apiKey: string;
  assistantId: string;
  baseUrl?: string;
  position?: 'bottom-right' | 'bottom-left' | 'top-right' | 'top-left';
  primaryColor?: string;
  buttonSize?: number;
  greeting?: string;
  onCallStart?: () => void;
  onCallEnd?: (data: { duration: number; transcript: any[] }) => void;
  onError?: (error: Error) => void;
  onTranscript?: (text: string, role: 'user' | 'assistant') => void;
}

interface VoiceAIWidget {
  init: (config: VoiceAIConfig) => void;
  start: () => Promise<void>;
  stop: () => void;
  isActive: () => boolean;
  destroy: () => void;
}

(function() {
  const DEFAULT_BASE_URL = 'https://api.voiceai.com';
  const DEFAULT_WS_URL = 'wss://voice.voiceai.com';
  
  let config: VoiceAIConfig;
  let socket: WebSocket | null = null;
  let mediaStream: MediaStream | null = null;
  let audioContext: AudioContext | null = null;
  let outputContext: AudioContext | null = null;
  let isCallActive = false;
  let container: HTMLDivElement | null = null;
  let callId: string | null = null;
  
  // Audio playback queue for seamless streaming
  let audioQueue: AudioBuffer[] = [];
  let isPlaying = false;
  let nextPlayTime = 0;

  const styles = `
    .voiceai-widget {
      position: fixed;
      z-index: 9999;
      font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif;
    }
    .voiceai-widget.bottom-right { bottom: 20px; right: 20px; }
    .voiceai-widget.bottom-left { bottom: 20px; left: 20px; }
    .voiceai-widget.top-right { top: 20px; right: 20px; }
    .voiceai-widget.top-left { top: 20px; left: 20px; }
    
    .voiceai-button {
      width: 60px;
      height: 60px;
      border-radius: 50%;
      border: none;
      cursor: pointer;
      display: flex;
      align-items: center;
      justify-content: center;
      box-shadow: 0 4px 12px rgba(0, 0, 0, 0.15);
      transition: transform 0.2s, box-shadow 0.2s;
    }
    .voiceai-button:hover {
      transform: scale(1.05);
      box-shadow: 0 6px 16px rgba(0, 0, 0, 0.2);
    }
    .voiceai-button:active {
      transform: scale(0.95);
    }
    .voiceai-button.active {
      animation: voiceai-pulse 1.5s infinite;
    }
    
    @keyframes voiceai-pulse {
      0% { box-shadow: 0 0 0 0 rgba(var(--voiceai-color-rgb), 0.4); }
      70% { box-shadow: 0 0 0 20px rgba(var(--voiceai-color-rgb), 0); }
      100% { box-shadow: 0 0 0 0 rgba(var(--voiceai-color-rgb), 0); }
    }
    
    .voiceai-button svg {
      width: 28px;
      height: 28px;
      fill: white;
    }
    
    .voiceai-panel {
      position: absolute;
      bottom: 70px;
      right: 0;
      width: 320px;
      background: white;
      border-radius: 12px;
      box-shadow: 0 4px 24px rgba(0, 0, 0, 0.15);
      overflow: hidden;
      display: none;
    }
    .voiceai-panel.open { display: block; }
    
    .voiceai-panel-header {
      padding: 16px;
      border-bottom: 1px solid #eee;
      display: flex;
      align-items: center;
      justify-content: space-between;
    }
    .voiceai-panel-header h3 {
      margin: 0;
      font-size: 16px;
      font-weight: 600;
    }
    
    .voiceai-panel-content {
      padding: 16px;
      max-height: 300px;
      overflow-y: auto;
    }
    
    .voiceai-message {
      margin-bottom: 12px;
      padding: 10px 14px;
      border-radius: 12px;
      font-size: 14px;
      line-height: 1.4;
    }
    .voiceai-message.user {
      background: #f0f0f0;
      margin-left: 20%;
    }
    .voiceai-message.assistant {
      background: var(--voiceai-color);
      color: white;
      margin-right: 20%;
    }
    
    .voiceai-status {
      text-align: center;
      padding: 8px;
      font-size: 12px;
      color: #666;
    }
    .voiceai-status.listening {
      color: var(--voiceai-color);
    }
  `;

  function injectStyles() {
    const styleEl = document.createElement('style');
    styleEl.textContent = styles;
    document.head.appendChild(styleEl);
  }

  function hexToRgb(hex: string): string {
    const result = /^#?([a-f\d]{2})([a-f\d]{2})([a-f\d]{2})$/i.exec(hex);
    return result 
      ? `${parseInt(result[1], 16)}, ${parseInt(result[2], 16)}, ${parseInt(result[3], 16)}`
      : '14, 165, 233';
  }

  function createWidget() {
    const primaryColor = config.primaryColor || '#0ea5e9';
    const position = config.position || 'bottom-right';
    
    container = document.createElement('div');
    container.className = `voiceai-widget ${position}`;
    container.style.setProperty('--voiceai-color', primaryColor);
    container.style.setProperty('--voiceai-color-rgb', hexToRgb(primaryColor));
    
    container.innerHTML = `
      <div class="voiceai-panel" id="voiceai-panel">
        <div class="voiceai-panel-header">
          <h3>Voice Assistant</h3>
          <button id="voiceai-close" style="background:none;border:none;cursor:pointer;font-size:20px;">&times;</button>
        </div>
        <div class="voiceai-panel-content" id="voiceai-messages"></div>
        <div class="voiceai-status" id="voiceai-status">Click the button to start</div>
      </div>
      <button class="voiceai-button" id="voiceai-btn" style="background-color: ${primaryColor}">
        <svg viewBox="0 0 24 24">
          <path d="M12 14c1.66 0 3-1.34 3-3V5c0-1.66-1.34-3-3-3S9 3.34 9 5v6c0 1.66 1.34 3 3 3zm-1 1.93c-3.94-.49-7-3.85-7-7.93V7h2v1c0 2.76 2.24 5 5 5s5-2.24 5-5V7h2v1c0 4.08-3.06 7.44-7 7.93V19h3v2H9v-2h3v-3.07z"/>
        </svg>
      </button>
    `;
    
    document.body.appendChild(container);
    
    // Event listeners
    const button = document.getElementById('voiceai-btn');
    const panel = document.getElementById('voiceai-panel');
    const closeBtn = document.getElementById('voiceai-close');
    
    button?.addEventListener('click', async () => {
      if (isCallActive) {
        stopCall();
      } else {
        panel?.classList.add('open');
        await startCall();
      }
    });
    
    closeBtn?.addEventListener('click', () => {
      panel?.classList.remove('open');
      if (isCallActive) stopCall();
    });
  }

  async function createCall(): Promise<string> {
    const baseUrl = config.baseUrl || DEFAULT_BASE_URL;
    const response = await fetch(`${baseUrl}/v1/calls/web`, {
      method: 'POST',
      headers: {
        'Content-Type': 'application/json',
        'x-api-key': config.apiKey,
      },
      body: JSON.stringify({
        assistantId: config.assistantId,
      }),
    });
    
    if (!response.ok) {
      throw new Error('Failed to create call');
    }
    
    const data = await response.json();
    return data.data.id;
  }

  async function startCall() {
    try {
      updateStatus('Connecting...');
      
      // Create call via API
      callId = await createCall();
      
      // Get microphone access
      mediaStream = await navigator.mediaDevices.getUserMedia({ audio: true });
      
      // Connect WebSocket
      const wsUrl = config.baseUrl?.replace('https', 'wss').replace('http', 'ws') || DEFAULT_WS_URL;
      socket = new WebSocket(`${wsUrl}/ws/${callId}`);
      socket.binaryType = 'arraybuffer';
      
      socket.onopen = () => {
        isCallActive = true;
        document.getElementById('voiceai-btn')?.classList.add('active');
        updateStatus('Listening...', 'listening');
        config.onCallStart?.();
        startAudioCapture();
      };
      
      socket.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          // Audio data
          playAudio(event.data);
        } else {
          // JSON event
          const message = JSON.parse(event.data);
          handleEvent(message);
        }
      };
      
      socket.onerror = (error) => {
        console.error('WebSocket error:', error);
        config.onError?.(new Error('Connection error'));
        stopCall();
      };
      
      socket.onclose = () => {
        stopCall();
      };
      
    } catch (error) {
      console.error('Failed to start call:', error);
      config.onError?.(error as Error);
      updateStatus('Failed to connect');
    }
  }

  function stopCall() {
    if (socket) {
      socket.send(JSON.stringify({ type: 'end' }));
      socket.close();
      socket = null;
    }
    
    if (mediaStream) {
      mediaStream.getTracks().forEach(track => track.stop());
      mediaStream = null;
    }
    
    // Clear audio queue
    clearAudioQueue();
    
    if (audioContext) {
      audioContext.close();
      audioContext = null;
    }
    
    isCallActive = false;
    document.getElementById('voiceai-btn')?.classList.remove('active');
    updateStatus('Call ended');
    config.onCallEnd?.({ duration: 0, transcript: [] });
  }

  function startAudioCapture() {
    if (!mediaStream || !socket) return;
    
    audioContext = new AudioContext({ sampleRate: 16000 });
    const source = audioContext.createMediaStreamSource(mediaStream);
    const processor = audioContext.createScriptProcessor(4096, 1, 1);
    
    processor.onaudioprocess = (e) => {
      if (!isCallActive || !socket || socket.readyState !== WebSocket.OPEN) return;
      
      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = new Int16Array(inputData.length);
      
      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
      }
      
      socket.send(pcmData.buffer);
    };
    
    source.connect(processor);
    processor.connect(audioContext.destination);
  }

  function playAudio(data: ArrayBuffer) {
    if (!outputContext) {
      outputContext = new AudioContext({ sampleRate: 24000 });
    }
    
    const int16Array = new Int16Array(data);
    const float32Array = new Float32Array(int16Array.length);
    
    for (let i = 0; i < int16Array.length; i++) {
      float32Array[i] = int16Array[i] / 32768;
    }
    
    const buffer = outputContext.createBuffer(1, float32Array.length, 24000);
    buffer.copyToChannel(float32Array, 0);
    
    // Add to queue and start playback if not already playing
    audioQueue.push(buffer);
    if (!isPlaying) {
      playNextInQueue();
    }
  }
  
  function playNextInQueue() {
    if (!outputContext || audioQueue.length === 0) {
      isPlaying = false;
      return;
    }
    
    isPlaying = true;
    const buffer = audioQueue.shift()!;
    
    const source = outputContext.createBufferSource();
    source.buffer = buffer;
    source.connect(outputContext.destination);
    
    // Schedule playback - use precise timing for seamless audio
    const currentTime = outputContext.currentTime;
    const startTime = Math.max(currentTime, nextPlayTime);
    source.start(startTime);
    
    // Schedule next chunk
    nextPlayTime = startTime + buffer.duration;
    
    // When this chunk ends, play the next one
    source.onended = () => {
      playNextInQueue();
    };
  }
  
  function clearAudioQueue() {
    // Clear pending audio
    audioQueue = [];
    isPlaying = false;
    nextPlayTime = 0;
    
    // Stop current playback by creating new context
    if (outputContext && outputContext.state !== 'closed') {
      outputContext.close().catch(() => {});
      outputContext = new AudioContext({ sampleRate: 24000 });
    }
  }

  function handleEvent(event: any) {
    switch (event.type) {
      case 'transcript.final':
        addMessage(event.data.text, 'user');
        config.onTranscript?.(event.data.text, 'user');
        break;
      case 'assistant.message':
        addMessage(event.data.text, 'assistant');
        config.onTranscript?.(event.data.text, 'assistant');
        break;
      case 'speech.started':
        updateStatus('Listening...', 'listening');
        break;
      case 'assistant.speaking':
        updateStatus('Speaking...');
        break;
      case 'assistant.interrupted':
        // User interrupted - clear audio queue immediately
        if (event.data?.clearAudio) {
          clearAudioQueue();
        }
        updateStatus('Listening...', 'listening');
        break;
      case 'assistant.audio.done':
        updateStatus('Listening...', 'listening');
        break;
      case 'call.ended':
        stopCall();
        break;
      case 'error':
        config.onError?.(new Error(event.data.message));
        break;
    }
  }

  function addMessage(text: string, role: 'user' | 'assistant') {
    const messagesEl = document.getElementById('voiceai-messages');
    if (!messagesEl) return;
    
    const messageEl = document.createElement('div');
    messageEl.className = `voiceai-message ${role}`;
    messageEl.textContent = text;
    messagesEl.appendChild(messageEl);
    messagesEl.scrollTop = messagesEl.scrollHeight;
  }

  function updateStatus(text: string, className?: string) {
    const statusEl = document.getElementById('voiceai-status');
    if (!statusEl) return;
    statusEl.textContent = text;
    statusEl.className = `voiceai-status ${className || ''}`;
  }

  // Public API
  const VoiceAI: VoiceAIWidget = {
    init(userConfig: VoiceAIConfig) {
      config = userConfig;
      injectStyles();
      createWidget();
    },
    
    async start() {
      if (!isCallActive) {
        await startCall();
      }
    },
    
    stop() {
      stopCall();
    },
    
    isActive() {
      return isCallActive;
    },
    
    destroy() {
      stopCall();
      container?.remove();
    },
  };

  // Expose to window
  (window as any).VoiceAI = VoiceAI;
})();
