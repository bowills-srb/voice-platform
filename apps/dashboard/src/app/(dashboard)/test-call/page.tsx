'use client';

import { useState, useRef, useCallback } from 'react';
import { useQuery } from '@tanstack/react-query';
import { Phone, PhoneOff } from 'lucide-react';
import { DashboardShell } from '@/components/dashboard/shell';
import { api } from '@/lib/api';

export default function TestCallPage() {
  const [selectedAssistant, setSelectedAssistant] = useState('');
  const [isCallActive, setIsCallActive] = useState(false);
  const [status, setStatus] = useState('Select an assistant and click Start Call');
  const [messages, setMessages] = useState<Array<{ role: string; text: string }>>([]);
  
  const wsRef = useRef<WebSocket | null>(null);
  const mediaStreamRef = useRef<MediaStream | null>(null);
  const audioContextRef = useRef<AudioContext | null>(null);
  
  // Streaming audio playback with queue
  const outputContextRef = useRef<AudioContext | null>(null);
  const audioQueueRef = useRef<AudioBuffer[]>([]);
  const isPlayingRef = useRef(false);
  const nextPlayTimeRef = useRef(0);

  const { data: assistants } = useQuery({
    queryKey: ['assistants'],
    queryFn: () => api.get('/assistants').then(r => r.data),
  });

  const playNextInQueue = useCallback(() => {
    if (!outputContextRef.current || audioQueueRef.current.length === 0) {
      isPlayingRef.current = false;
      return;
    }
    
    isPlayingRef.current = true;
    const buffer = audioQueueRef.current.shift()!;
    
    const source = outputContextRef.current.createBufferSource();
    source.buffer = buffer;
    source.connect(outputContextRef.current.destination);
    
    // Schedule playback - use precise timing for seamless audio
    const currentTime = outputContextRef.current.currentTime;
    const startTime = Math.max(currentTime, nextPlayTimeRef.current);
    source.start(startTime);
    
    // Schedule next chunk
    nextPlayTimeRef.current = startTime + buffer.duration;
    
    // When this chunk ends, play the next one
    source.onended = () => {
      playNextInQueue();
    };
  }, []);

  // Clear audio on interrupt
  const clearAudioQueue = useCallback(() => {
    // Clear pending audio
    audioQueueRef.current = [];
    isPlayingRef.current = false;
    nextPlayTimeRef.current = 0;
    
    // Reset output audio context to stop all playing audio
    if (outputContextRef.current && outputContextRef.current.state !== 'closed') {
      outputContextRef.current.close().catch(() => {});
      outputContextRef.current = new AudioContext({ sampleRate: 24000 });
      outputContextRef.current.resume();
    }
  }, []);

  // Play audio chunk from server (PCM 24kHz 16-bit format)
  const playAudio = useCallback(async (data: ArrayBuffer) => {
    const byteLength = data.byteLength;
    if (byteLength < 100) return;

    if (!outputContextRef.current) {
      outputContextRef.current = new AudioContext({ sampleRate: 24000 });
      await outputContextRef.current.resume();
    }

    try {
      // Convert PCM 16-bit to Float32 for Web Audio API
      const pcmData = new Int16Array(data);
      const floatData = new Float32Array(pcmData.length);
      
      for (let i = 0; i < pcmData.length; i++) {
        floatData[i] = pcmData[i] / 32768;
      }
      
      // Create audio buffer
      const audioBuffer = outputContextRef.current.createBuffer(1, floatData.length, 24000);
      audioBuffer.copyToChannel(floatData, 0);
      
      // Add to queue and start playback if not already playing
      audioQueueRef.current.push(audioBuffer);
      if (!isPlayingRef.current) {
        playNextInQueue();
      }
    } catch (error) {
      console.error('Audio playback error:', error);
    }
  }, [playNextInQueue]);

  const startCall = async () => {
    if (!selectedAssistant) {
      setStatus('Please select an assistant first');
      return;
    }

    try {
      setStatus('Creating call...');
      
      const response = await api.post('/calls', {
        assistantId: selectedAssistant,
        type: 'web',
      });
      
      const callId = response.data.id;
      setStatus('Connecting to voice engine...');

      mediaStreamRef.current = await navigator.mediaDevices.getUserMedia({ 
        audio: {
          sampleRate: 16000,
          channelCount: 1,
          echoCancellation: true,
          noiseSuppression: true,
        } 
      });

      const wsUrl = process.env.NEXT_PUBLIC_WS_URL || 'ws://localhost:4001';
      wsRef.current = new WebSocket(`${wsUrl}/ws/${callId}`);
      wsRef.current.binaryType = 'arraybuffer';

      wsRef.current.onopen = () => {
        setIsCallActive(true);
        clearAudioQueue();
        setStatus('Connected - speak now!');
        startAudioCapture();
      };

      wsRef.current.onmessage = (event) => {
        if (event.data instanceof ArrayBuffer) {
          playAudio(event.data);
        } else {
          const msg = JSON.parse(event.data);
          handleEvent(msg);
        }
      };

      wsRef.current.onerror = (error) => {
        console.error('WebSocket error:', error);
        setStatus('Connection error');
        endCall();
      };

      wsRef.current.onclose = () => {
        setStatus('Call ended');
        setIsCallActive(false);
      };

    } catch (error: any) {
      console.error('Failed to start call:', error);
      setStatus(`Error: ${error.message}`);
    }
  };

  const startAudioCapture = () => {
    if (!mediaStreamRef.current || !wsRef.current) return;

    audioContextRef.current = new AudioContext({ sampleRate: 16000 });
    audioContextRef.current.resume();
    const source = audioContextRef.current.createMediaStreamSource(mediaStreamRef.current);
    const processor = audioContextRef.current.createScriptProcessor(4096, 1, 1);

    processor.onaudioprocess = (e) => {
      if (!wsRef.current || wsRef.current.readyState !== WebSocket.OPEN) return;

      const inputData = e.inputBuffer.getChannelData(0);
      const pcmData = new Int16Array(inputData.length);

      for (let i = 0; i < inputData.length; i++) {
        pcmData[i] = Math.max(-32768, Math.min(32767, inputData[i] * 32768));
      }

      wsRef.current.send(pcmData.buffer);
    };

    source.connect(processor);
    processor.connect(audioContextRef.current.destination);
  };

  const handleEvent = (event: any) => {
    switch (event.type) {
      case 'transcript':
      case 'transcript.final':
        setMessages(prev => [...prev, { role: 'user', text: event.data?.text || event.text }]);
        break;
      case 'assistant.message':
      case 'response':
        setMessages(prev => [...prev, { role: 'assistant', text: event.data?.text || event.text }]);
        break;
      case 'assistant.interrupted':
        console.log('INTERRUPT: clearing audio queue');
        clearAudioQueue();
        setStatus('Listening...');
        break;
      case 'assistant.speaking':
        setStatus('Assistant speaking...');
        break;
      case 'assistant.audio.done':
        setStatus('Listening...');
        break;
      case 'error':
        setStatus(`Error: ${event.data?.message || event.message}`);
        break;
    }
  };

  const endCall = () => {
    if (wsRef.current) {
      wsRef.current.close();
      wsRef.current = null;
    }

    if (mediaStreamRef.current) {
      mediaStreamRef.current.getTracks().forEach(track => track.stop());
      mediaStreamRef.current = null;
    }

    clearAudioQueue();

    if (audioContextRef.current) {
      audioContextRef.current.close();
      audioContextRef.current = null;
    }

    setIsCallActive(false);
    setStatus('Call ended');
  };

  return (
    <DashboardShell>
      <div className="max-w-2xl mx-auto p-6">
        <h1 className="text-2xl font-bold mb-2">Test Call</h1>
        <p className="text-gray-600 mb-6">Test your voice assistant in the browser</p>

        <div className="bg-white rounded-lg shadow p-6 mb-6">
          <label className="block text-sm font-medium mb-2">Select Assistant</label>
          <select
            value={selectedAssistant}
            onChange={(e) => setSelectedAssistant(e.target.value)}
            className="w-full p-2 border rounded mb-4"
            disabled={isCallActive}
          >
            <option value="">Choose an assistant...</option>
            {assistants?.map((a: any) => (
              <option key={a.id} value={a.id}>{a.name}</option>
            ))}
          </select>

          <div className="flex items-center justify-between">
            <div className="flex items-center gap-2">
              <div className={`w-3 h-3 rounded-full ${isCallActive ? 'bg-green-500' : 'bg-gray-300'}`} />
              <span className="text-sm">{status}</span>
            </div>
            
            {!isCallActive ? (
              <button
                onClick={startCall}
                className="flex items-center gap-2 bg-green-500 text-white px-4 py-2 rounded hover:bg-green-600"
              >
                <Phone size={18} />
                Start Call
              </button>
            ) : (
              <button
                onClick={endCall}
                className="flex items-center gap-2 bg-red-500 text-white px-4 py-2 rounded hover:bg-red-600"
              >
                <PhoneOff size={18} />
                End Call
              </button>
            )}
          </div>
        </div>

        <div className="bg-white rounded-lg shadow p-6">
          <h2 className="font-semibold mb-4">Conversation</h2>
          <div className="space-y-3 max-h-96 overflow-y-auto">
            {messages.length === 0 ? (
              <p className="text-gray-400 text-center py-8">Start a call to see the conversation</p>
            ) : (
              messages.map((msg, i) => (
                <div key={i} className={`p-3 rounded ${msg.role === 'user' ? 'bg-blue-50' : 'bg-gray-50'}`}>
                  <span className="text-xs font-medium text-gray-500 block mb-1">
                    {msg.role === 'user' ? 'You' : 'Assistant'}
                  </span>
                  {msg.text}
                </div>
              ))
            )}
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}
