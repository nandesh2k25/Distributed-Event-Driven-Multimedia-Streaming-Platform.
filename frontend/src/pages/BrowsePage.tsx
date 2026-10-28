import { useSearchParams } from 'react-router-dom';
import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { AlbumCard, ArtistCard, Section, Status, TrackRow, gridClass } from '../components/Cards';

export default function BrowsePage() {
  const [params, setParams] = useSearchParams();
  const genre = params.get('genre') ?? '';

  const genres = useApi((s) => api.genres(s), []);
  const artists = useApi((s) => api.artists(s), []);
  const albums = useApi((s) => api.albums(s), []);
  const tracks = useApi(
    (s) => api.tracks(`?limit=20${genre ? `&genre=${encodeURIComponent(genre)}` : ''}`, s),
    [genre]
  );

  const chip = (active: boolean) =>
    `rounded-full px-3 py-1 text-sm ${active ? 'bg-accent text-zinc-950' : 'bg-zinc-800 hover:bg-zinc-700'}`;

  return (
    <>
      <div className="mb-8 flex flex-wrap gap-2" role="group" aria-label="Filter by genre">
        <button onClick={() => setParams({})} className={chip(!genre)}>
          All
        </button>
        {genres.data?.map((g) => (
          <button key={g.id} onClick={() => setParams({ genre: g.slug })} className={chip(genre === g.slug)}>
            {g.name}
          </button>
        ))}
      </div>

      <Section title="Tracks">
        <Status loading={tracks.loading} error={tracks.error} empty={tracks.data?.length === 0} />
        <ul>{tracks.data?.map((t, i) => <TrackRow key={t.id} track={t} index={i + 1} />)}</ul>
      </Section>

      <Section title="Artists">
        <Status loading={artists.loading} error={artists.error} empty={artists.data?.length === 0} />
        <div className={gridClass}>{artists.data?.map((a) => <ArtistCard key={a.id} artist={a} />)}</div>
      </Section>

      <Section title="Albums">
        <Status loading={albums.loading} error={albums.error} empty={albums.data?.length === 0} />
        <div className={gridClass}>{albums.data?.map((a) => <AlbumCard key={a.id} album={a} />)}</div>
      </Section>
    </>
  );
}
