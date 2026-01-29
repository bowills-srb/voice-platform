'use client';

import { useQuery } from '@tanstack/react-query';
import { PhoneCall, Clock, DollarSign, Zap } from 'lucide-react';
import { api } from '@/lib/api';

export function StatsCards() {
  const { data } = useQuery({
    queryKey: ['analytics', 'calls'],
    queryFn: () => api.get('/analytics/calls').then(r => r.data),
  });

  const stats = [
    {
      name: 'Total Calls',
      value: data?.summary?.totalCalls || 0,
      icon: PhoneCall,
      change: '+12%',
      changeType: 'positive',
    },
    {
      name: 'Total Minutes',
      value: data?.summary?.totalDurationMinutes || 0,
      icon: Clock,
      change: '+8%',
      changeType: 'positive',
    },
    {
      name: 'Total Cost',
      value: `$${((data?.summary?.totalCostCents || 0) / 100).toFixed(2)}`,
      icon: DollarSign,
      change: '+5%',
      changeType: 'negative',
    },
    {
      name: 'Avg Latency',
      value: `${data?.summary?.avgLatency?.total || 0}ms`,
      icon: Zap,
      change: '-15%',
      changeType: 'positive',
    },
  ];

  return (
    <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
      {stats.map((stat) => (
        <div key={stat.name} className="bg-white rounded-lg shadow p-6">
          <div className="flex items-center justify-between">
            <div>
              <p className="text-sm text-gray-500">{stat.name}</p>
              <p className="text-2xl font-semibold mt-1">{stat.value}</p>
            </div>
            <div className="h-12 w-12 bg-primary-50 rounded-lg flex items-center justify-center">
              <stat.icon className="h-6 w-6 text-primary-600" />
            </div>
          </div>
          <div className="mt-4">
            <span className={`text-sm ${
              stat.changeType === 'positive' ? 'text-green-600' : 'text-red-600'
            }`}>
              {stat.change}
            </span>
            <span className="text-sm text-gray-500 ml-2">vs last month</span>
          </div>
        </div>
      ))}
    </div>
  );
}
