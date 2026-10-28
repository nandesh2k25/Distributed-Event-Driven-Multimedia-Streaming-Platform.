import { useEffect, useRef, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListPlus } from 'lucide-react';
import { useRequireLogin } from '../context/AuthContext';
import { api, type Playlist } from '../lib/api';

export function AddToPlaylistMenu({ trackId, title }: { trackId: string; title: string }) {
  const requireLogin = useRequireLogin();
  const [open, setOpen] = useState(false);
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [message, setMessage] = useState<{ text: string; ok: boolean } | null>(null);
  const root = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (!open) return;
    setMessage(null);
    const ctrl = new AbortController();
    api
      .playlists(ctrl.signal)
      .then(({ data }) => setPlaylists(data))
      .catch((err: Error) => err.name !== 'AbortError' && setMessage({ text: err.message, ok: false }));

    const close = (e: MouseEvent | KeyboardEvent) => {
      if (e instanceof KeyboardEvent ? e.key === 'Escape' : !root.current?.contains(e.target as Node)) setOpen(false);
    };
    document.addEventListener('mousedown', close);
    document.addEventListener('keydown', close);
    return () => {
      ctrl.abort();
      document.removeEventListener('mousedown', close);
      document.removeEventListener('keydown', close);
    };
  }, [open]);

  const add = async (playlist: Playlist) => {
    try {
      await api.addToPlaylist(playlist.id, trackId);
      setMessage({ text: `Added to ${playlist.title}`, ok: true });
    } catch (err) {
      setMessage({ text: (err as Error).message, ok: false });
    }
  };

  return (
    <div ref={root} className="relative shrink-0">
      <button
        onClick={() => requireLogin(() => setOpen((o) => !o), 'Sign in to build playlists.')}
        aria-haspopup="menu"
        aria-expanded={open}
        aria-label={`Add to playlist: ${title}`}
        className="text-zinc-500 hover:text-white"
      >
        <ListPlus className="h-4 w-4" />
      </button>
      {open && (
        <div role="menu" className="absolute right-0 z-30 mt-2 w-56 rounded-md border border-zinc-700 bg-zinc-900 p-1 shadow-xl">
          {playlists === null && !message && <p className="px-3 py-2 text-sm text-zinc-400">Loading…</p>}
          {playlists?.length === 0 && (
            <Link to="/playlists" className="block px-3 py-2 text-sm text-accent hover:underline">
              Create your first playlist
            </Link>
          )}
          {playlists?.map((p) => (
            <button
              key={p.id}
              role="menuitem"
              onClick={() => add(p)}
              className="block w-full truncate rounded px-3 py-2 text-left text-sm hover:bg-zinc-800"
            >
              {p.title}
            </button>
          ))}
          {message && (
            <p role="status" className={`px-3 py-2 text-xs ${message.ok ? 'text-accent' : 'text-red-400'}`}>
              {message.text}
            </p>
          )}
        </div>
      )}
    </div>
  );
}
