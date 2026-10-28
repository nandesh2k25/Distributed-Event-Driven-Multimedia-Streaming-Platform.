import { useParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { AlbumCard, Section, Status, TrackRow, gridClass } from '../components/Cards';

export default function ArtistPage() {
  const { id = '' } = useParams();
  const { data: artist, loading, error } = useApi((s) => api.artist(id, s), [id]);
  return (
    <>
      <Status loading={loading} error={error} />
      {artist && (
        <>
          <h1 className="text-3xl font-bold">{artist.name}</h1>
          {artist.bio && <p className="mb-8 mt-2 max-w-2xl text-zinc-400">{artist.bio}</p>}
          <Section title="Albums">
            <div className={gridClass}>
              {artist.albums?.map((a) => <AlbumCard key={a.id} album={{ ...a, artist }} />)}
            </div>
          </Section>
          <Section title="Tracks">
            <ul>{artist.tracks?.map((t, i) => <TrackRow key={t.id} track={{ ...t, artist }} index={i + 1} />)}</ul>
          </Section>
        </>
      )}
    </>
  );
}
