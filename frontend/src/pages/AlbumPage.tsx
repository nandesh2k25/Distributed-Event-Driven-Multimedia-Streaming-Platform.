import { Link, useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { Status, TrackRow } from '../components/Cards';

export default function AlbumPage() {
  const { id = '' } = useParams();
  const { data: album, loading, error } = useApi((s) => api.album(id, s), [id]);
  return (
    <>
      <Status loading={loading} error={error} />
      {album && (
        <>
          <h1 className="text-3xl font-bold">{album.title}</h1>
          <p className="mb-6 text-zinc-400">
            {album.artist && (
              <Link to={`/artists/${album.artist.id}`} className="hover:underline">
                {album.artist.name}
              </Link>
            )}
            {album.releaseYear ? ` · ${album.releaseYear}` : ''}
          </p>
          <ul>
            {album.tracks?.map((t, i) => (
              <TrackRow key={t.id} track={{ ...t, artist: t.artist ?? album.artist }} index={t.trackNumber ?? i + 1} queue={album.tracks} />
            ))}
          </ul>
        </>
      )}
    </>
  );
}
