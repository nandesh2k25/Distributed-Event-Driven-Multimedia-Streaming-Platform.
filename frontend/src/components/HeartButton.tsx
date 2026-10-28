import { Heart } from 'lucide-react';
import { useRequireLogin } from '../context/AuthContext';
import { useFavorites } from '../context/FavoritesContext';

export function HeartButton({ trackId, title }: { trackId: string; title?: string }) {
  const { isFavorite, toggle } = useFavorites();
  const requireLogin = useRequireLogin();
  const active = isFavorite(trackId);
  return (
    <button
      onClick={() => requireLogin(() => toggle(trackId), 'Sign in to save favorites.')}
      aria-pressed={active}
      aria-label={`${active ? 'Remove from' : 'Add to'} favorites${title ? `: ${title}` : ''}`}
      className={`shrink-0 transition ${active ? 'text-rose-500' : 'text-zinc-500 hover:text-white'}`}
    >
      <Heart className="h-4 w-4" fill={active ? 'currentColor' : 'none'} />
    </button>
  );
}
