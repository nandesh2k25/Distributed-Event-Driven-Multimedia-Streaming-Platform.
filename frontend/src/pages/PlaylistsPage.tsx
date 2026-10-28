import { useCallback, useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { ListMusic, Plus } from 'lucide-react';
import { api, type Playlist } from '../lib/api';
import { Status } from '../components/Cards';

const inputClass =
  'w-full rounded-md bg-zinc-800 px-3 py-2 text-sm outline-none ring-accent placeholder:text-zinc-500 focus:ring-2';

export default function PlaylistsPage() {
  const [playlists, setPlaylists] = useState<Playlist[] | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [title, setTitle] = useState('');
  const [description, setDescription] = useState('');
  const [isPublic, setIsPublic] = useState(true);
  const [creating, setCreating] = useState(false);
  const [createError, setCreateError] = useState<string | null>(null);

  const load = useCallback(async (signal?: AbortSignal) => {
    try {
      const { data } = await api.playlists(signal);
      setPlaylists(data);
      setLoadError(null);
    } catch (err) {
      if ((err as Error).name !== 'AbortError') setLoadError((err as Error).message);
    }
  }, []);

  useEffect(() => {
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  const create = async (e: React.FormEvent) => {
    e.preventDefault();
    setCreating(true);
    setCreateError(null);
    try {
      await api.createPlaylist({ title, description: description || undefined, isPublic });
      setTitle('');
      setDescription('');
      await load();
    } catch (err) {
      setCreateError((err as Error).message);
    } finally {
      setCreating(false);
    }
  };

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Playlists</h1>

      <form onSubmit={create} className="mb-10 max-w-xl space-y-3 rounded-lg bg-zinc-800/60 p-4">
        <h2 className="text-sm font-semibold text-zinc-300">New playlist</h2>
        <input className={inputClass} placeholder="Title" value={title} onChange={(e) => setTitle(e.target.value)} required maxLength={100} aria-label="Playlist title" />
        <input className={inputClass} placeholder="Description (optional)" value={description} onChange={(e) => setDescription(e.target.value)} maxLength={500} aria-label="Playlist description" />
        <div className="flex items-center justify-between">
          <label className="flex items-center gap-2 text-sm text-zinc-400">
            <input type="checkbox" checked={isPublic} onChange={(e) => setIsPublic(e.target.checked)} className="accent-emerald-500" />
            Public
          </label>
          <button
            type="submit"
            disabled={creating || !title.trim()}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40"
          >
            <Plus className="h-4 w-4" /> Create
          </button>
        </div>
        {createError && <p className="text-sm text-red-400" role="alert">{createError}</p>}
      </form>

      <Status loading={playlists === null && !loadError} error={loadError} empty={playlists?.length === 0} />
      <ul className="grid grid-cols-1 gap-4 sm:grid-cols-2 lg:grid-cols-3">
        {playlists?.map((p) => (
          <li key={p.id}>
            <Link to={`/playlists/${p.id}`} className="flex items-center gap-4 rounded-lg bg-zinc-800 p-4 transition hover:bg-zinc-700">
              <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-md bg-zinc-900">
                <ListMusic className="h-6 w-6 text-zinc-500" />
              </span>
              <span className="min-w-0">
                <span className="block truncate font-medium">{p.title}</span>
                <span className="block text-sm text-zinc-400">
                  {p.trackCount ?? 0} {p.trackCount === 1 ? 'track' : 'tracks'}
                  {!p.isPublic && ' · private'}
                </span>
              </span>
            </Link>
          </li>
        ))}
      </ul>
    </>
  );
}
