import { useState } from 'react';
import type { FormEvent } from 'react';
import { Link, Navigate, useLocation, useNavigate } from 'react-router-dom';
import { Loader2 } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

const inputClass =
  'w-full rounded-md bg-zinc-800 px-3 py-2 text-sm outline-none ring-accent placeholder:text-zinc-500 focus:ring-2';

interface RedirectState {
  from?: string;
  reason?: string;
}

export default function AuthPage({ mode }: { mode: 'login' | 'signup' }) {
  const { isSignedIn, login, signup } = useAuth();
  const navigate = useNavigate();
  const state = (useLocation().state ?? {}) as RedirectState;
  const isSignup = mode === 'signup';

  const [displayName, setDisplayName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const destination = state.from ?? '/';
  if (isSignedIn && !busy) return <Navigate to={destination} replace />;

  const submit = async (e: FormEvent) => {
    e.preventDefault();
    setBusy(true);
    setError(null);
    try {
      if (isSignup) await signup({ email, password, displayName });
      else await login({ email, password });
      navigate(destination, { replace: true });
    } catch (err) {
      setError((err as Error).message);
      setBusy(false);
    }
  };

  return (
    <div className="mx-auto max-w-sm">
      <h1 className="mb-1 text-2xl font-bold">{isSignup ? 'Create your account' : 'Welcome back'}</h1>
      <p className="mb-6 text-sm text-zinc-400">
        {state.reason ?? (isSignup ? 'Premium tracks, playlists, favorites and uploads.' : 'Sign in to continue.')}
      </p>

      <form onSubmit={submit} className="space-y-4">
        {isSignup && (
          <label className="block text-sm">
            <span className="mb-1 block text-zinc-300">Name</span>
            <input
              required
              maxLength={60}
              autoComplete="name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              className={inputClass}
            />
          </label>
        )}
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Email</span>
          <input
            required
            type="email"
            autoComplete="email"
            value={email}
            onChange={(e) => setEmail(e.target.value)}
            className={inputClass}
          />
        </label>
        <label className="block text-sm">
          <span className="mb-1 block text-zinc-300">Password</span>
          <input
            required
            type="password"
            minLength={isSignup ? 8 : undefined}
            autoComplete={isSignup ? 'new-password' : 'current-password'}
            value={password}
            onChange={(e) => setPassword(e.target.value)}
            className={inputClass}
          />
          {isSignup && <span className="mt-1 block text-xs text-zinc-500">At least 8 characters.</span>}
        </label>

        {error && (
          <p role="alert" className="rounded bg-red-950 px-3 py-2 text-sm text-red-300">
            {error}
          </p>
        )}

        <button
          type="submit"
          disabled={busy}
          className="flex w-full items-center justify-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40"
        >
          {busy && <Loader2 className="h-4 w-4 animate-spin" />}
          {isSignup ? 'Sign up' : 'Sign in'}
        </button>
      </form>

      <p className="mt-6 text-sm text-zinc-400">
        {isSignup ? 'Already have an account? ' : 'New here? '}
        <Link to={isSignup ? '/login' : '/signup'} state={state} className="text-accent hover:underline">
          {isSignup ? 'Sign in' : 'Create an account'}
        </Link>
      </p>
    </div>
  );
}
