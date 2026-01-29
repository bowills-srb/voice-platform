'use client';

import { useParams, useRouter } from 'next/navigation';
import { useQuery } from '@tanstack/react-query';
import { ArrowLeft } from 'lucide-react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/shell';
import { api } from '@/lib/api';

export default function AssistantDetailPage() {
  const params = useParams();
  const router = useRouter();
  const id = params.id as string;

  const { data: assistant, isLoading } = useQuery({
    queryKey: ['assistant', id],
    queryFn: () => api.get(`/assistants/${id}`).then(r => r.data),
  });

  if (isLoading) {
    return (
      <DashboardShell>
        <div className="flex items-center justify-center py-12">
          <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
        </div>
      </DashboardShell>
    );
  }

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center gap-4">
          <Link href="/assistants" className="p-2 hover:bg-gray-100 rounded-lg">
            <ArrowLeft className="h-5 w-5" />
          </Link>
          <div>
            <h1 className="text-2xl font-bold">{assistant?.name}</h1>
            <p className="text-gray-500">Assistant Configuration</p>
          </div>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold mb-4">Model Settings</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Provider</dt>
                <dd className="font-medium">{assistant?.modelProvider}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Model</dt>
                <dd className="font-medium">{assistant?.modelName}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-lg shadow p-6">
            <h2 className="font-semibold mb-4">Voice Settings</h2>
            <dl className="space-y-3">
              <div>
                <dt className="text-sm text-gray-500">Voice Provider</dt>
                <dd className="font-medium">{assistant?.voiceProvider}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Voice ID</dt>
                <dd className="font-medium text-sm">{assistant?.voiceId}</dd>
              </div>
              <div>
                <dt className="text-sm text-gray-500">Transcriber</dt>
                <dd className="font-medium">{assistant?.transcriberProvider}</dd>
              </div>
            </dl>
          </div>

          <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
            <h2 className="font-semibold mb-4">System Prompt</h2>
            <p className="text-gray-700 whitespace-pre-wrap">{assistant?.systemPrompt}</p>
          </div>

          <div className="bg-white rounded-lg shadow p-6 md:col-span-2">
            <h2 className="font-semibold mb-4">First Message</h2>
            <p className="text-gray-700">{assistant?.firstMessage || 'No first message set'}</p>
          </div>
        </div>
      </div>
    </DashboardShell>
  );
}