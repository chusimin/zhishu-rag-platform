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

  const refresh = useCallback(async (): Promise<Me | null> => {
    if (!getAccessToken()) {
      setMe(null);
      setLoading(false);
      return null;
    }
    try {
      const loaded = await fetchMe();
      setMe(loaded);
      return loaded;
    } catch {
      setMe(null);
      return null;
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
    // 登录成功但取不到账号信息（如没有业务空间权限）时要明确报错，而不是悄悄退回登录页
    if (!(await refresh())) throw new Error('登录成功，但无法获取账号信息，请确认已加入业务空间后重试');
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
