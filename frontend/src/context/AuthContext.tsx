import { createContext, useCallback, useContext, useEffect, useMemo, useSyncExternalStore } from 'react';
import type { ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { api } from '../lib/api';
import { clearSession, getSession, setSession, subscribeSession, type SessionUser } from '../lib/session';

interface AuthValue {
  user: SessionUser | null;
  isSignedIn: boolean;
  signup: (input: { email: string; password: string; displayName: string }) => Promise<void>;
  login: (input: { email: string; password: string }) => Promise<void>;
  logout: () => void;
}

// Outside a provider everyone is a guest, which keeps isolated component tests simple.
const GUEST: AuthValue = {
  user: null,
  isSignedIn: false,
  signup: async () => undefined,
  login: async () => undefined,
  logout: () => undefined
};

const AuthContext = createContext<AuthValue>(GUEST);

export function AuthProvider({ children }: { children: ReactNode }) {
  const session = useSyncExternalStore(subscribeSession, getSession);

  // A stored token may have expired or its account may be gone; check once on load.
  useEffect(() => {
    if (!getSession()) return;
    api.me().catch(() => undefined); // a 401 clears the session inside the API client
  }, []);

  const signup = useCallback<AuthValue['signup']>(async (input) => {
    const { data } = await api.signup(input);
    setSession({ token: data.token, user: data.user });
  }, []);

  const login = useCallback<AuthValue['login']>(async (input) => {
    const { data } = await api.login(input);
    setSession({ token: data.token, user: data.user });
  }, []);

  const value = useMemo<AuthValue>(
    () => ({ user: session?.user ?? null, isSignedIn: !!session, signup, login, logout: clearSession }),
    [session, signup, login]
  );

  return <AuthContext.Provider value={value}>{children}</AuthContext.Provider>;
}

export const useAuth = () => useContext(AuthContext);

/** Runs `action` for signed-in users; sends guests to the login page, then back here afterwards. */
export function useRequireLogin() {
  const { isSignedIn } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  return useCallback(
    (action: () => void, reason = 'Sign in to use this feature') => {
      if (isSignedIn) action();
      else navigate('/login', { state: { from: location.pathname + location.search, reason } });
    },
    [isSignedIn, navigate, location]
  );
}
