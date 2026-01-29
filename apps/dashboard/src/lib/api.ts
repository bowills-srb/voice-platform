import { useAuthStore } from './store/auth';

const API_URL = process.env.NEXT_PUBLIC_API_URL || 'http://localhost:4000/v1';

interface RequestConfig {
  params?: Record<string, any>;
  headers?: Record<string, string>;
}

async function request<T>(
  method: string,
  path: string,
  data?: unknown,
  config?: RequestConfig
): Promise<{ data: T; meta?: any }> {
  const token = useAuthStore.getState().token;
  
  let url = `${API_URL}${path}`;
  
  if (config?.params) {
    const params = new URLSearchParams();
    Object.entries(config.params).forEach(([key, value]) => {
      if (value !== undefined && value !== null) {
        params.append(key, String(value));
      }
    });
    url += `?${params.toString()}`;
  }

  const headers: Record<string, string> = {
    'Content-Type': 'application/json',
    ...config?.headers,
  };

  if (token) {
    headers['Authorization'] = `Bearer ${token}`;
  }

  const response = await fetch(url, {
    method,
    headers,
    body: data ? JSON.stringify(data) : undefined,
  });

  const result = await response.json();

  if (!response.ok) {
    throw new Error(result.error?.message || 'Request failed');
  }

  return result;
}

export const api = {
  get: <T = any>(path: string, config?: RequestConfig) => 
    request<T>('GET', path, undefined, config),
  
  post: <T = any>(path: string, data?: unknown, config?: RequestConfig) => 
    request<T>('POST', path, data, config),
  
  patch: <T = any>(path: string, data?: unknown, config?: RequestConfig) => 
    request<T>('PATCH', path, data, config),
  
  delete: <T = any>(path: string, config?: RequestConfig) => 
    request<T>('DELETE', path, undefined, config),
};

// Auth functions
export async function login(email: string, password: string) {
  const result = await api.post<{
    token: string;
    user: { id: string; email: string; name: string; role: string };
    organization: { id: string; name: string; slug: string; planType: string };
  }>('/auth/login', { email, password });
  
  useAuthStore.getState().setAuth(result.data.token, result.data.user, result.data.organization);
  
  return result;
}

export async function register(data: {
  email: string;
  password: string;
  name: string;
  organizationName: string;
}) {
  const result = await api.post<{
    token: string;
    user: { id: string; email: string; name: string; role: string };
    organization: { id: string; name: string; slug: string };
  }>('/auth/register', data);
  
  useAuthStore.getState().setAuth(result.data.token, result.data.user, result.data.organization as any);
  
  return result;
}

export function logout() {
  useAuthStore.getState().logout();
}
