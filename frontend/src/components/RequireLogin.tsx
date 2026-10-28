import type { ReactNode } from 'react';
import { Link, useLocation } from 'react-router-dom';
import { Lock } from 'lucide-react';
import { useAuth } from '../context/AuthContext';

/** Shows its page to signed-in users; guests get a prompt to sign in instead. */
export function RequireLogin({ feature, children }: { feature: string; children: ReactNode }) {
  const { isSignedIn } = useAuth();
  const location = useLocation();
  if (isSignedIn) return <>{children}</>;

  const state = { from: location.pathname, reason: `Sign in to use ${feature}.` };
  return (
    <div className="mx-auto mt-16 max-w-sm text-center">
      <Lock className="mx-auto mb-4 h-8 w-8 text-zinc-500" />
      <h1 className="mb-2 text-xl font-semibold">Sign in to use {feature}</h1>
      <p className="mb-6 text-sm text-zinc-400">Guests can browse and play free music.</p>
      <div className="flex justify-center gap-3">
        <Link to="/login" state={state} className="rounded-full bg-accent px-4 py-2 text-sm font-medium text-zinc-950">
          Sign in
        </Link>
        <Link to="/signup" state={state} className="rounded-full bg-zinc-800 px-4 py-2 text-sm hover:bg-zinc-700">
          Sign up
        </Link>
      </div>
    </div>
  );
}
