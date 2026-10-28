import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { AlbumCard, ArtistCard, Section, Status, TrackRow, gridClass } from '../components/Cards';

export default function SearchPage() {
  const [params] = useSearchParams();
  const q = params.get('q') ?? '';
  const { data, loading, error } = useApi((s) => api.search(q, s), [q]);
  const total = data ? data.tracks.length + data.artists.length + data.albums.length : 0;

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Results for “{q}”</h1>
      <Status loading={loading} error={error} empty={!!data && total === 0} />
      {data && data.tracks.length > 0 && (
        <Section title="Tracks">
          <ul>{data.tracks.map((t, i) => <TrackRow key={t.id} track={t} index={i + 1} />)}</ul>
        </Section>
      )}
      {data && data.artists.length > 0 && (
        <Section title="Artists">
          <div className={gridClass}>{data.artists.map((a) => <ArtistCard key={a.id} artist={a} />)}</div>
        </Section>
      )}
      {data && data.albums.length > 0 && (
        <Section title="Albums">
          <div className={gridClass}>{data.albums.map((a) => <AlbumCard key={a.id} album={a} />)}</div>
        </Section>
      )}
    </>
  );
}
