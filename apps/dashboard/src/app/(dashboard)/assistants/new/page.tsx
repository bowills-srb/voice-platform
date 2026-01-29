'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { useMutation } from '@tanstack/react-query';
import { DashboardShell } from '@/components/dashboard/shell';
import { api } from '@/lib/api';

const modelOptions = {
  openai: ['gpt-4o', 'gpt-4o-mini', 'gpt-4-turbo'],
  anthropic: ['claude-3-haiku-20240307', 'claude-3-sonnet-20240229', 'claude-3-opus-20240229'],
  google: ['gemini-1.5-flash', 'gemini-1.5-pro'],
  groq: ['llama-3.1-8b-instant', 'llama-3.1-70b-versatile'],
};

const voiceOptions = {
  elevenlabs: [
    { id: '21m00Tcm4TlvDq8ikWAM', name: 'Rachel' },
    { id: 'AZnzlk1XvdvUeBnXmlld', name: 'Domi' },
    { id: 'EXAVITQu4vr4xnSDxMaL', name: 'Bella' },
  ],
  cartesia: [
    { id: 'a0e99841-438c-4a64-b679-ae501e7d6091', name: 'Barbershop Man' },
    { id: '79a125e8-cd45-4c13-8a67-188112f4dd22', name: 'British Lady' },
  ],
  openai: [
    { id: 'alloy', name: 'Alloy' },
    { id: 'echo', name: 'Echo' },
    { id: 'fable', name: 'Fable' },
    { id: 'onyx', name: 'Onyx' },
    { id: 'nova', name: 'Nova' },
    { id: 'shimmer', name: 'Shimmer' },
  ],
};

export default function NewAssistantPage() {
  const router = useRouter();
  
  const [form, setForm] = useState({
    name: '',
    modelProvider: 'anthropic',
    modelName: 'claude-3-haiku-20240307',
    systemPrompt: 'You are a helpful voice assistant. Keep responses concise and conversational.',
    firstMessage: 'Hello! How can I help you today?',
    voiceProvider: 'cartesia',
    voiceId: 'a0e99841-438c-4a64-b679-ae501e7d6091',
    transcriberProvider: 'deepgram',
    interruptionEnabled: true,
    silenceTimeoutMs: 2000,
  });

  const createMutation = useMutation({
    mutationFn: (data: typeof form) => api.post('/assistants', data),
    onSuccess: (result) => {
      router.push(`/assistants/${result.data.id}`);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    createMutation.mutate(form);
  };

  return (
    <DashboardShell>
      <div className="max-w-3xl">
        <div className="mb-6">
          <h1 className="text-2xl font-bold">Create Assistant</h1>
          <p className="text-gray-500">Configure your new voice AI assistant</p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-6">
          {/* Basic Info */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold mb-4">Basic Information</h2>
            <div className="space-y-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Name</label>
                <input
                  type="text"
                  value={form.name}
                  onChange={(e) => setForm({ ...form, name: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                  placeholder="My Assistant"
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">System Prompt</label>
                <textarea
                  value={form.systemPrompt}
                  onChange={(e) => setForm({ ...form, systemPrompt: e.target.value })}
                  rows={4}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                  placeholder="You are a helpful assistant..."
                  required
                />
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">First Message</label>
                <input
                  type="text"
                  value={form.firstMessage}
                  onChange={(e) => setForm({ ...form, firstMessage: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                  placeholder="Hello! How can I help you today?"
                />
              </div>
            </div>
          </div>

          {/* Model */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold mb-4">Language Model</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select
                  value={form.modelProvider}
                  onChange={(e) => setForm({ 
                    ...form, 
                    modelProvider: e.target.value,
                    modelName: modelOptions[e.target.value as keyof typeof modelOptions][0]
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="openai">OpenAI</option>
                  <option value="anthropic">Anthropic</option>
                  <option value="google">Google</option>
                  <option value="groq">Groq</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Model</label>
                <select
                  value={form.modelName}
                  onChange={(e) => setForm({ ...form, modelName: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                >
                  {modelOptions[form.modelProvider as keyof typeof modelOptions]?.map((model) => (
                    <option key={model} value={model}>{model}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Voice */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold mb-4">Voice</h2>
            <div className="grid grid-cols-2 gap-4">
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
                <select
                  value={form.voiceProvider}
                  onChange={(e) => setForm({ 
                    ...form, 
                    voiceProvider: e.target.value,
                    voiceId: voiceOptions[e.target.value as keyof typeof voiceOptions]?.[0]?.id || ''
                  })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                >
                  <option value="elevenlabs">ElevenLabs</option>
                  <option value="cartesia">Cartesia</option>
                  <option value="openai">OpenAI</option>
                </select>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">Voice</label>
                <select
                  value={form.voiceId}
                  onChange={(e) => setForm({ ...form, voiceId: e.target.value })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                >
                  {voiceOptions[form.voiceProvider as keyof typeof voiceOptions]?.map((voice) => (
                    <option key={voice.id} value={voice.id}>{voice.name}</option>
                  ))}
                </select>
              </div>
            </div>
          </div>

          {/* Transcription */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold mb-4">Transcription</h2>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Provider</label>
              <select
                value={form.transcriberProvider}
                onChange={(e) => setForm({ ...form, transcriberProvider: e.target.value })}
                className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
              >
                <option value="deepgram">Deepgram</option>
                <option value="assemblyai">AssemblyAI</option>
                <option value="openai">OpenAI Whisper</option>
              </select>
            </div>
          </div>

          {/* Behavior */}
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold mb-4">Behavior</h2>
            <div className="space-y-4">
              <div className="flex items-center justify-between">
                <div>
                  <p className="font-medium">Allow Interruptions</p>
                  <p className="text-sm text-gray-500">User can interrupt the assistant while speaking</p>
                </div>
                <label className="relative inline-flex items-center cursor-pointer">
                  <input
                    type="checkbox"
                    checked={form.interruptionEnabled}
                    onChange={(e) => setForm({ ...form, interruptionEnabled: e.target.checked })}
                    className="sr-only peer"
                  />
                  <div className="w-11 h-6 bg-gray-200 peer-focus:outline-none peer-focus:ring-4 peer-focus:ring-primary-300 rounded-full peer peer-checked:after:translate-x-full rtl:peer-checked:after:-translate-x-full peer-checked:after:border-white after:content-[''] after:absolute after:top-[2px] after:start-[2px] after:bg-white after:border-gray-300 after:border after:rounded-full after:h-5 after:w-5 after:transition-all peer-checked:bg-primary-600"></div>
                </label>
              </div>
              <div>
                <label className="block text-sm font-medium text-gray-700 mb-1">
                  Silence Timeout (ms)
                </label>
                <input
                  type="number"
                  value={form.silenceTimeoutMs}
                  onChange={(e) => setForm({ ...form, silenceTimeoutMs: parseInt(e.target.value) })}
                  className="w-full px-3 py-2 border border-gray-300 rounded-lg focus:ring-primary-500 focus:border-primary-500"
                  min={500}
                  max={10000}
                  step={100}
                />
              </div>
            </div>
          </div>

          {/* Submit */}
          <div className="flex gap-4">
            <button
              type="button"
              onClick={() => router.back()}
              className="px-4 py-2 border border-gray-300 text-gray-700 rounded-lg hover:bg-gray-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={createMutation.isPending}
              className="px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 disabled:opacity-50"
            >
              {createMutation.isPending ? 'Creating...' : 'Create Assistant'}
            </button>
          </div>

          {createMutation.isError && (
            <div className="bg-red-50 border border-red-200 text-red-700 px-4 py-3 rounded-lg">
              {(createMutation.error as Error)?.message || 'Failed to create assistant'}
            </div>
          )}
        </form>
      </div>
    </DashboardShell>
  );
}
