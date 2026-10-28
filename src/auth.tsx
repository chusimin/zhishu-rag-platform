import { createContext, useCallback, useContext, useEffect, useState, type PropsWithChildren } from 'react';
import { fetchMe, getAccessToken, login as apiLogin, logout as apiLogout, type Me } from './api/auth';
import type { Role } from './types';

type AuthState = {
  me: Me | null;
  loading: boolean;
  login: (email: string, password: string) => Promise<void>;
  logout: () => Promise<void>;
};

const AuthCtx = createContext<AuthState>({ me: null, loading: true, login: async () => undefined, logout: async () => undefined });

export function AuthProvider({ children }: PropsWithChildren) {
  const [me, setMe] = useState<Me | null>(null);
  const [loading, setLoading] = useState(true);

  const refresh = useCallback(async () => {
    if (!getAccessToken()) {
      setMe(null);
      setLoading(false);
      return;
    }
    try {
      setMe(await fetchMe());
    } catch {
      setMe(null);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void refresh();
    const expired = () => setMe(null);
    window.addEventListener('fde-session-expired', expired);
    return () => window.removeEventListener('fde-session-expired', expired);
  }, [refresh]);

  const login = async (email: string, password: string) => {
    await apiLogin(email, password);
    await refresh();
  };

  const logout = async () => {
    await apiLogout();
    setMe(null);
  };

  return <AuthCtx.Provider value={{ me, loading, login, logout }}>{children}</AuthCtx.Provider>;
}

export const useAuth = () => useContext(AuthCtx);

export function isManager(role: Role | undefined) {
  return role === 'admin' || role === 'manager';
}
