import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import type { ReactNode } from 'react';
import { api } from '../lib/api';

interface FavoritesValue {
  isFavorite: (trackId: string) => boolean;
  /** Flips the heart immediately, then syncs; the change is rolled back if the API rejects it. */
  toggle: (trackId: string) => void;
}

const FavoritesContext = createContext<FavoritesValue | null>(null);

export function FavoritesProvider({ children }: { children: ReactNode }) {
  const [ids, setIds] = useState<ReadonlySet<string>>(new Set());
  const [error, setError] = useState<string | null>(null);
  const idsRef = useRef(ids);
  idsRef.current = ids;
  // Toggles made locally; they must survive the initial load finishing after the user already clicked.
  const localChanges = useRef(new Map<string, boolean>());

  useEffect(() => {
    const ctrl = new AbortController();
    api
      .favoriteIds(ctrl.signal)
      .then(({ data }) => {
        const loaded = new Set(data);
        for (const [trackId, favorited] of localChanges.current) {
          if (favorited) loaded.add(trackId);
          else loaded.delete(trackId);
        }
        setIds(loaded);
      })
      .catch(() => undefined); // hearts simply start empty if the service is down
    return () => ctrl.abort();
  }, []);

  useEffect(() => {
    if (!error) return;
    const t = setTimeout(() => setError(null), 4000);
    return () => clearTimeout(t);
  }, [error]);

  const set = useCallback((trackId: string, favorited: boolean) => {
    localChanges.current.set(trackId, favorited);
    setIds((prev) => {
      const next = new Set(prev);
      if (favorited) next.add(trackId);
      else next.delete(trackId);
      return next;
    });
  }, []);

  const toggle = useCallback(
    (trackId: string) => {
      const was = idsRef.current.has(trackId);
      set(trackId, !was); // optimistic
      api.setFavorite(trackId, !was).catch((err: Error) => {
        set(trackId, was); // revert only this track
        setError(err.message || 'Could not update favorite');
      });
    },
    [set]
  );

  const value = useMemo<FavoritesValue>(() => ({ isFavorite: (id) => ids.has(id), toggle }), [ids, toggle]);

  return (
    <FavoritesContext.Provider value={value}>
      {children}
      {error && (
        <p role="alert" className="fixed bottom-24 left-1/2 z-50 -translate-x-1/2 rounded bg-red-900 px-4 py-2 text-sm shadow-lg">
          {error}
        </p>
      )}
    </FavoritesContext.Provider>
  );
}

export function useFavorites() {
  const ctx = useContext(FavoritesContext);
  if (!ctx) throw new Error('useFavorites must be used within FavoritesProvider');
  return ctx;
}
