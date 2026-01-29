'use client';

import { useState } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { Plus, Bot, MoreVertical, Pencil, Trash2 } from 'lucide-react';
import Link from 'next/link';
import { DashboardShell } from '@/components/dashboard/shell';
import { api } from '@/lib/api';

export default function AssistantsPage() {
  const queryClient = useQueryClient();
  const [showCreateModal, setShowCreateModal] = useState(false);

  const { data, isLoading } = useQuery({
    queryKey: ['assistants'],
    queryFn: () => api.get('/assistants').then(r => r.data),
  });

  const deleteMutation = useMutation({
    mutationFn: (id: string) => api.delete(`/assistants/${id}`),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['assistants'] });
    },
  });

  return (
    <DashboardShell>
      <div className="space-y-6">
        <div className="flex items-center justify-between">
          <div>
            <h1 className="text-2xl font-bold">Assistants</h1>
            <p className="text-gray-500">Manage your voice AI assistants</p>
          </div>
          <Link
            href="/assistants/new"
            className="flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700 transition-colors"
          >
            <Plus className="h-5 w-5" />
            Create Assistant
          </Link>
        </div>

        {isLoading ? (
          <div className="flex items-center justify-center py-12">
            <div className="animate-spin rounded-full h-8 w-8 border-b-2 border-primary-600"></div>
          </div>
        ) : data?.length === 0 ? (
          <div className="bg-white rounded-lg shadow p-12 text-center">
            <Bot className="h-12 w-12 text-gray-400 mx-auto mb-4" />
            <h3 className="text-lg font-medium text-gray-900 mb-2">No assistants yet</h3>
            <p className="text-gray-500 mb-4">Get started by creating your first voice AI assistant</p>
            <Link
              href="/assistants/new"
              className="inline-flex items-center gap-2 px-4 py-2 bg-primary-600 text-white rounded-lg hover:bg-primary-700"
            >
              <Plus className="h-5 w-5" />
              Create Assistant
            </Link>
          </div>
        ) : (
          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-4">
            {data?.map((assistant: any) => (
              <div key={assistant.id} className="bg-white rounded-lg shadow p-6 hover:shadow-md transition-shadow">
                <div className="flex items-start justify-between mb-4">
                  <div className="h-10 w-10 bg-primary-100 rounded-lg flex items-center justify-center">
                    <Bot className="h-6 w-6 text-primary-600" />
                  </div>
                  <div className="relative group">
                    <button className="p-1 rounded hover:bg-gray-100">
                      <MoreVertical className="h-5 w-5 text-gray-400" />
                    </button>
                    <div className="absolute right-0 mt-1 w-36 bg-white rounded-lg shadow-lg border opacity-0 invisible group-hover:opacity-100 group-hover:visible transition-all z-10">
                      <Link
                        href={`/assistants/${assistant.id}`}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-gray-700 hover:bg-gray-50"
                      >
                        <Pencil className="h-4 w-4" />
                        Edit
                      </Link>
                      <button
                        onClick={() => deleteMutation.mutate(assistant.id)}
                        className="flex items-center gap-2 px-3 py-2 text-sm text-red-600 hover:bg-red-50 w-full"
                      >
                        <Trash2 className="h-4 w-4" />
                        Delete
                      </button>
                    </div>
                  </div>
                </div>
                <Link href={`/assistants/${assistant.id}`}>
                  <h3 className="font-semibold text-gray-900 mb-1">{assistant.name}</h3>
                  <p className="text-sm text-gray-500 mb-3">
                    {assistant.modelProvider} / {assistant.modelName}
                  </p>
                  <div className="flex items-center gap-4 text-sm text-gray-500">
                    <span>{assistant.callCount || 0} calls</span>
                    <span>{assistant.voiceProvider}</span>
                  </div>
                </Link>
              </div>
            ))}
          </div>
        )}
      </div>
    </DashboardShell>
  );
}
