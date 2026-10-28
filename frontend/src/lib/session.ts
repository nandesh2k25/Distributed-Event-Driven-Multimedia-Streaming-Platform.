export interface SessionUser {
  id: string;
  email: string;
  displayName: string;
}

interface Session {
  token: string;
  user: SessionUser;
}

const KEY = 'music.session';
const listeners = new Set<() => void>();

// localStorage can throw (private windows, blocked storage), so keep a copy in memory too.
let current: Session | null = read();

function read(): Session | null {
  try {
    const raw = localStorage.getItem(KEY);
    return raw ? (JSON.parse(raw) as Session) : null;
  } catch {
    return null;
  }
}

function emit() {
  listeners.forEach((l) => l());
}

export const getSession = () => current;
export const getToken = () => current?.token ?? null;

export function setSession(session: Session) {
  current = session;
  try {
    localStorage.setItem(KEY, JSON.stringify(session));
  } catch {
    /* session lasts for this page only */
  }
  emit();
}

export function clearSession() {
  if (!current) return;
  current = null;
  try {
    localStorage.removeItem(KEY);
  } catch {
    /* nothing stored */
  }
  emit();
}

export function subscribeSession(listener: () => void) {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

export const authHeaders = (): Record<string, string> => {
  const token = getToken();
  return token ? { authorization: `Bearer ${token}` } : {};
};
