import { Link } from 'react-router-dom';
import { Disc3, Pause, Play, User } from 'lucide-react';
import { useAudioPlayer } from '../context/AudioPlayerContext';
import { type Album, type Artist, type Track, formatDuration } from '../lib/api';

export function AlbumCard({ album }: { album: Album }) {
  return (
    <Link to={`/albums/${album.id}`} className="group rounded-lg bg-zinc-800 p-3 transition hover:bg-zinc-700">
      <div className="mb-3 flex aspect-square items-center justify-center overflow-hidden rounded-md bg-zinc-900">
        {album.coverUrl ? (
          <img src={album.coverUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <Disc3 className="h-10 w-10 text-zinc-600" />
        )}
      </div>
      <p className="truncate font-medium">{album.title}</p>
      <p className="truncate text-sm text-zinc-400">
        {album.artist?.name}
        {album.releaseYear ? ` · ${album.releaseYear}` : ''}
      </p>
    </Link>
  );
}

export function ArtistCard({ artist }: { artist: Artist }) {
  return (
    <Link to={`/artists/${artist.id}`} className="rounded-lg bg-zinc-800 p-3 text-center transition hover:bg-zinc-700">
      <div className="mx-auto mb-3 flex aspect-square w-full max-w-32 items-center justify-center overflow-hidden rounded-full bg-zinc-900">
        {artist.avatarUrl ? (
          <img src={artist.avatarUrl} alt="" className="h-full w-full object-cover" loading="lazy" />
        ) : (
          <User className="h-10 w-10 text-zinc-600" />
        )}
      </div>
      <p className="truncate font-medium">{artist.name}</p>
      {artist._count && <p className="text-sm text-zinc-400">{artist._count.tracks} tracks</p>}
    </Link>
  );
}

export function TrackRow({ track, index, queue }: { track: Track; index?: number; queue?: Track[] }) {
  const player = useAudioPlayer();
  const isCurrent = player.currentTrack?.id === track.id;
  const isPlaying = isCurrent && player.isPlaying;

  return (
    <li className={`group flex items-center gap-4 rounded-md px-3 py-2 hover:bg-zinc-800 ${isCurrent ? 'bg-zinc-800/60' : ''}`}>
      <button
        onClick={() => (isCurrent ? player.togglePlay() : player.playTrack(track, queue))}
        aria-label={`${isPlaying ? 'Pause' : 'Play'} ${track.title}`}
        className="flex h-6 w-6 items-center justify-center text-sm text-zinc-500"
      >
        <span className={isCurrent ? 'hidden' : 'group-hover:hidden'}>{index ?? ''}</span>
        <span className={isCurrent ? 'text-accent' : 'hidden text-white group-hover:inline'}>
          {isPlaying ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </span>
      </button>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium">{track.title}</p>
        <p className="truncate text-sm text-zinc-400">
          {track.artist && (
            <Link to={`/artists/${track.artist.id}`} className="hover:underline">
              {track.artist.name}
            </Link>
          )}
          {track.album && (
            <>
              {' · '}
              <Link to={`/albums/${track.album.id}`} className="hover:underline">
                {track.album.title}
              </Link>
            </>
          )}
        </p>
      </div>
      {track.genre && (
        <span className="hidden rounded-full bg-zinc-800 px-2 py-0.5 text-xs text-zinc-300 sm:inline">
          {track.genre.name}
        </span>
      )}
      <span className="w-12 text-right text-sm tabular-nums text-zinc-400">{formatDuration(track.duration)}</span>
    </li>
  );
}

export function Section({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="mb-10">
      <h2 className="mb-4 text-xl font-semibold">{title}</h2>
      {children}
    </section>
  );
}

export function Status({ loading, error, empty }: { loading: boolean; error: string | null; empty?: boolean }) {
  if (loading) return <p className="text-zinc-400" role="status">Loading…</p>;
  if (error) return <p className="text-red-400" role="alert">{error}</p>;
  if (empty) return <p className="text-zinc-500">Nothing here yet.</p>;
  return null;
}

export const gridClass = 'grid grid-cols-2 gap-4 sm:grid-cols-3 md:grid-cols-4 lg:grid-cols-5 xl:grid-cols-6';
