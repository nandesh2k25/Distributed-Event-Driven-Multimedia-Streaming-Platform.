import { useCallback, useEffect, useRef, useState } from 'react';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { ChevronDown, ChevronUp, GripVertical, Play, Trash2, X } from 'lucide-react';
import { api, moveItem, type PlaylistDetail, type PlaylistEntry } from '../lib/api';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { Status, TrackRow } from '../components/Cards';

export default function PlaylistPage() {
  const { id = '' } = useParams();
  const navigate = useNavigate();
  const player = useAudioPlayer();
  const [detail, setDetail] = useState<PlaylistDetail | null>(null);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [dragFrom, setDragFrom] = useState<number | null>(null);
  const [dragOver, setDragOver] = useState<number | null>(null);
  // Writes run one at a time, in click order, so the server always ends on the user's last arrangement.
  const queue = useRef<Promise<unknown>>(Promise.resolve());

  const load = useCallback(
    async (signal?: AbortSignal) => {
      try {
        const { data } = await api.playlist(id, signal);
        setDetail(data);
        setLoadError(null);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') setLoadError((err as Error).message);
      }
    },
    [id]
  );

  useEffect(() => {
    setDetail(null);
    const ctrl = new AbortController();
    void load(ctrl.signal);
    return () => ctrl.abort();
  }, [load]);

  /** Applies `apply` to the UI immediately, then persists; on failure the list is re-fetched from the server. */
  const mutate = (apply: (tracks: PlaylistEntry[]) => PlaylistEntry[], persist: (next: PlaylistEntry[]) => Promise<unknown>) => {
    if (!detail) return;
    const next = apply(detail.tracks);
    setDetail({ ...detail, tracks: next });
    setActionError(null);
    queue.current = queue.current
      .then(() => persist(next))
      .catch(async (err: Error) => {
        setActionError(err.message || 'Could not save your changes');
        await load();
      });
  };

  const reorder = (from: number, to: number) => {
    if (from === to) return;
    mutate(
      (tracks) => moveItem(tracks, from, to),
      (next) => api.reorderPlaylist(id, next.map((e) => e.trackId))
    );
  };

  const remove = (trackId: string) =>
    mutate(
      (tracks) => tracks.filter((e) => e.trackId !== trackId),
      () => api.removeFromPlaylist(id, trackId)
    );

  const deletePlaylist = async () => {
    if (!window.confirm(`Delete "${detail?.title}"? This cannot be undone.`)) return;
    try {
      await api.deletePlaylist(id);
      navigate('/playlists');
    } catch (err) {
      setActionError((err as Error).message);
    }
  };

  if (!detail) return <Status loading={!loadError} error={loadError} />;

  const owner = detail.isOwner;
  const playable = detail.tracks.flatMap((e) => (e.track ? [e.track] : []));

  return (
    <>
      <Link to="/playlists" className="text-sm text-zinc-400 hover:underline">← All playlists</Link>
      <div className="mb-6 mt-2 flex flex-wrap items-end justify-between gap-4">
        <div className="min-w-0">
          <h1 className="truncate text-3xl font-bold">{detail.title}</h1>
          {detail.description && <p className="mt-1 text-zinc-400">{detail.description}</p>}
          <p className="mt-1 text-sm text-zinc-500">
            {detail.tracks.length} {detail.tracks.length === 1 ? 'track' : 'tracks'}
            {!detail.isPublic && ' · private'}
          </p>
        </div>
        <div className="flex gap-2">
          <button
            onClick={() => playable[0] && player.playTrack(playable[0], playable)}
            disabled={playable.length === 0}
            className="flex items-center gap-2 rounded-full bg-accent px-4 py-2 text-sm font-medium text-zinc-950 disabled:opacity-40"
          >
            <Play className="h-4 w-4" /> Play
          </button>
          {owner && (
            <button onClick={deletePlaylist} aria-label="Delete playlist" className="rounded-full bg-zinc-800 p-2 text-zinc-400 hover:text-red-400">
              <Trash2 className="h-5 w-5" />
            </button>
          )}
        </div>
      </div>

      {actionError && <p className="mb-4 text-sm text-red-400" role="alert">{actionError}</p>}
      {detail.tracks.length === 0 && (
        <p className="text-zinc-500">No tracks yet. Use the “add to playlist” button on any track to fill this up.</p>
      )}

      <ul aria-label="Playlist tracks">
        {detail.tracks.map((entry, i) => {
          const controls = owner && (
            <div className="flex shrink-0 items-center gap-1">
              <button onClick={() => reorder(i, i - 1)} disabled={i === 0} aria-label={`Move up: ${entry.track?.title ?? 'unavailable track'}`} className="text-zinc-500 hover:text-white disabled:opacity-20">
                <ChevronUp className="h-4 w-4" />
              </button>
              <button onClick={() => reorder(i, i + 1)} disabled={i === detail.tracks.length - 1} aria-label={`Move down: ${entry.track?.title ?? 'unavailable track'}`} className="text-zinc-500 hover:text-white disabled:opacity-20">
                <ChevronDown className="h-4 w-4" />
              </button>
              <button onClick={() => remove(entry.trackId)} aria-label={`Remove from playlist: ${entry.track?.title ?? 'unavailable track'}`} className="ml-1 text-zinc-500 hover:text-red-400">
                <X className="h-4 w-4" />
              </button>
            </div>
          );
          const dragProps: React.LiHTMLAttributes<HTMLLIElement> = owner
            ? {
                draggable: true,
                onDragStart: () => setDragFrom(i),
                onDragOver: (e) => {
                  e.preventDefault(); // required to allow dropping
                  setDragOver(i);
                },
                onDragEnd: () => {
                  setDragFrom(null);
                  setDragOver(null);
                },
                onDrop: (e) => {
                  e.preventDefault();
                  if (dragFrom !== null) reorder(dragFrom, i);
                  setDragFrom(null);
                  setDragOver(null);
                },
                className: `${dragOver === i && dragFrom !== i ? 'ring-1 ring-accent' : ''} ${dragFrom === i ? 'opacity-40' : ''}`
              }
            : {};

          return entry.track ? (
            <TrackRow
              key={entry.trackId}
              track={entry.track}
              index={i + 1}
              queue={playable}
              hidePlaylistMenu
              liProps={dragProps}
              trailing={
                owner && (
                  <>
                    <GripVertical className="hidden h-4 w-4 shrink-0 cursor-grab text-zinc-600 sm:block" aria-hidden />
                    {controls}
                  </>
                )
              }
            />
          ) : (
            <li key={entry.trackId} {...dragProps} className={`flex items-center gap-4 rounded-md px-3 py-2 text-zinc-500 ${dragProps.className ?? ''}`}>
              <span className="w-6 text-right text-sm">{i + 1}</span>
              <span className="flex-1 italic">This track is no longer available</span>
              {controls}
            </li>
          );
        })}
      </ul>
    </>
  );
}
