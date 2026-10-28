import { api } from '../lib/api';
import { useApi } from '../hooks/useApi';
import { useFavorites } from '../context/FavoritesContext';
import { Status, TrackRow } from '../components/Cards';

export default function FavoritesPage() {
  const { data, loading, error } = useApi((s) => api.favorites(s), []);
  const { isFavorite } = useFavorites();
  // Un-hearting hides the row right away without a refetch; hearting again brings it back.
  const tracks = (data ?? []).map((f) => f.track).filter((t) => isFavorite(t.id));

  return (
    <>
      <h1 className="mb-6 text-2xl font-bold">Favorites</h1>
      <Status loading={loading} error={error} empty={!loading && !error && tracks.length === 0} />
      <ul>{tracks.map((t, i) => <TrackRow key={t.id} track={t} index={i + 1} queue={tracks} />)}</ul>
    </>
  );
}
