import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { Heart, ListMusic, Music, UploadCloud } from 'lucide-react';
import { AudioPlayerProvider } from './context/AudioPlayerContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { PlayerBar } from './components/PlayerBar';
import { SearchBar } from './components/SearchBar';
import BrowsePage from './pages/BrowsePage';
import SearchPage from './pages/SearchPage';
import UploadPage from './pages/UploadPage';
import AlbumPage from './pages/AlbumPage';
import ArtistPage from './pages/ArtistPage';
import PlaylistsPage from './pages/PlaylistsPage';
import PlaylistPage from './pages/PlaylistPage';
import FavoritesPage from './pages/FavoritesPage';

const navClass = ({ isActive }: { isActive: boolean }) =>
  `flex shrink-0 items-center gap-2 rounded-full px-3 py-2 text-sm hover:bg-zinc-700 ${isActive ? 'bg-zinc-700' : 'bg-zinc-800'}`;

export default function App() {
  return (
    <AudioPlayerProvider>
      <FavoritesProvider>
        <div className="min-h-screen bg-zinc-950 text-zinc-50">
          <header className="sticky top-0 z-40 flex items-center gap-3 border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur sm:px-8">
            <Link to="/" className="flex shrink-0 items-center gap-2 font-bold">
              <Music className="h-6 w-6 text-accent" />
              <span className="hidden lg:inline">Music Library</span>
            </Link>
            <SearchBar />
            <nav className="ml-auto flex items-center gap-2" aria-label="Main">
              <NavLink to="/playlists" className={navClass}>
                <ListMusic className="h-4 w-4" />
                <span className="hidden md:inline">Playlists</span>
              </NavLink>
              <NavLink to="/favorites" className={navClass}>
                <Heart className="h-4 w-4" />
                <span className="hidden md:inline">Favorites</span>
              </NavLink>
              <NavLink to="/upload" className={navClass}>
                <UploadCloud className="h-4 w-4" />
                <span className="hidden md:inline">Upload</span>
              </NavLink>
            </nav>
          </header>
          {/* pb-24 reserves room for the fixed bottom player bar */}
          <main className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-8">
            <Routes>
              <Route path="/" element={<BrowsePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/upload" element={<UploadPage />} />
              <Route path="/albums/:id" element={<AlbumPage />} />
              <Route path="/artists/:id" element={<ArtistPage />} />
              <Route path="/playlists" element={<PlaylistsPage />} />
              <Route path="/playlists/:id" element={<PlaylistPage />} />
              <Route path="/favorites" element={<FavoritesPage />} />
              <Route path="*" element={<p className="text-zinc-400">Page not found.</p>} />
            </Routes>
          </main>
          <PlayerBar />
        </div>
      </FavoritesProvider>
    </AudioPlayerProvider>
  );
}
