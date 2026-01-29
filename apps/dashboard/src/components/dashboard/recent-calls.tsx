'use client';

import { useQuery } from '@tanstack/react-query';
import { format } from 'date-fns';
import { PhoneIncoming, PhoneOutgoing, Globe } from 'lucide-react';
import Link from 'next/link';
import { api } from '@/lib/api';

const typeIcons = {
  inbound: PhoneIncoming,
  outbound: PhoneOutgoing,
  web: Globe,
};

const statusColors = {
  completed: 'bg-green-100 text-green-700',
  'in-progress': 'bg-blue-100 text-blue-700',
  failed: 'bg-red-100 text-red-700',
  'no-answer': 'bg-yellow-100 text-yellow-700',
};

export function RecentCalls() {
  const { data } = useQuery({
    queryKey: ['calls', { limit: 5 }],
    queryFn: () => api.get('/calls', { params: { limit: 5 } }).then(r => r.data),
  });

  return (
    <div className="bg-white rounded-lg shadow">
      <div className="px-6 py-4 border-b flex items-center justify-between">
        <h2 className="font-semibold">Recent Calls</h2>
        <Link href="/calls" className="text-sm text-primary-600 hover:text-primary-700">
          View all
        </Link>
      </div>
      <div className="divide-y">
        {data?.data?.map((call: any) => {
          const Icon = typeIcons[call.type as keyof typeof typeIcons] || PhoneIncoming;
          return (
            <Link 
              key={call.id} 
              href={`/calls/${call.id}`}
              className="flex items-center gap-4 px-6 py-4 hover:bg-gray-50 transition-colors"
            >
              <div className="h-10 w-10 bg-gray-100 rounded-full flex items-center justify-center">
                <Icon className="h-5 w-5 text-gray-600" />
              </div>
              <div className="flex-1 min-w-0">
                <p className="font-medium text-gray-900 truncate">
                  {call.type === 'inbound' ? call.fromNumber : call.toNumber}
                </p>
                <p className="text-sm text-gray-500">
                  {call.assistant?.name || 'Unknown'} • {call.durationSeconds ? `${Math.floor(call.durationSeconds / 60)}:${(call.durationSeconds % 60).toString().padStart(2, '0')}` : '-'}
                </p>
              </div>
              <div className="text-right">
                <span className={`inline-flex px-2 py-1 rounded-full text-xs font-medium ${statusColors[call.status as keyof typeof statusColors] || 'bg-gray-100 text-gray-700'}`}>
                  {call.status}
                </span>
                <p className="text-xs text-gray-500 mt-1">
                  {format(new Date(call.createdAt), 'MMM d, h:mm a')}
                </p>
              </div>
            </Link>
          );
        })}
        {(!data?.data || data.data.length === 0) && (
          <div className="px-6 py-8 text-center text-gray-500">
            No calls yet
          </div>
        )}
      </div>
    </div>
  );
}
