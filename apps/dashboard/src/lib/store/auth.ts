import { create } from 'zustand';
import { persist } from 'zustand/middleware';

interface User {
  id: string;
  email: string;
  name: string;
  role: string;
}

interface Organization {
  id: string;
  name: string;
  slug: string;
  planType: string;
}

interface AuthState {
  token: string | null;
  user: User | null;
  organization: Organization | null;
  isAuthenticated: boolean;
  isLoading: boolean;
  
  setAuth: (token: string, user: User, organization: Organization) => void;
  logout: () => void;
  setLoading: (loading: boolean) => void;
}

export const useAuthStore = create<AuthState>()(
  persist(
    (set) => ({
      token: null,
      user: null,
      organization: null,
      isAuthenticated: false,
      isLoading: true,
      
      setAuth: (token, user, organization) => set({
        token,
        user,
        organization,
        isAuthenticated: true,
        isLoading: false,
      }),
      
      logout: () => set({
        token: null,
        user: null,
        organization: null,
        isAuthenticated: false,
        isLoading: false,
      }),
      
      setLoading: (loading) => set({ isLoading: loading }),
    }),
    {
      name: 'auth-storage',
      onRehydrateStorage: () => (state) => {
        state?.setLoading(false);
      },
    }
  )
);
