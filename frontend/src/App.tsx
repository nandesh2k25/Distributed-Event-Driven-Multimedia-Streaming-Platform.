import { Link, NavLink, Route, Routes } from 'react-router-dom';
import { Heart, ListMusic, LogOut, Music, UploadCloud } from 'lucide-react';
import { AudioPlayerProvider } from './context/AudioPlayerContext';
import { AuthProvider, useAuth } from './context/AuthContext';
import { FavoritesProvider } from './context/FavoritesContext';
import { RequireLogin } from './components/RequireLogin';
import AuthPage from './pages/AuthPage';
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

function AccountMenu() {
  const { user, isSignedIn, logout } = useAuth();
  if (!isSignedIn) {
    return (
      <div className="ml-2 flex items-center gap-2 text-sm">
        <Link to="/login" className="rounded-full px-3 py-2 hover:bg-zinc-800">Sign in</Link>
        <Link to="/signup" className="rounded-full bg-accent px-3 py-2 font-medium text-zinc-950">Sign up</Link>
      </div>
    );
  }
  return (
    <div className="ml-2 flex items-center gap-2 text-sm">
      <span className="hidden max-w-32 truncate text-zinc-300 md:inline">{user?.displayName}</span>
      <button onClick={logout} aria-label="Sign out" className="rounded-full bg-zinc-800 p-2 hover:bg-zinc-700">
        <LogOut className="h-4 w-4" />
      </button>
    </div>
  );
}

function Shell() {
  const { user } = useAuth();
  return (
    <AudioPlayerProvider>
      {/* Remount on sign-in / sign-out so favorites reload for the right account. */}
      <FavoritesProvider key={user?.id ?? 'guest'}>
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
            <AccountMenu />
          </header>
          {/* pb-24 reserves room for the fixed bottom player bar */}
          <main className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-8">
            <Routes>
              <Route path="/" element={<BrowsePage />} />
              <Route path="/search" element={<SearchPage />} />
              <Route path="/login" element={<AuthPage mode="login" />} />
              <Route path="/signup" element={<AuthPage mode="signup" />} />
              <Route path="/upload" element={<RequireLogin feature="uploads"><UploadPage /></RequireLogin>} />
              <Route path="/albums/:id" element={<AlbumPage />} />
              <Route path="/artists/:id" element={<ArtistPage />} />
              <Route path="/playlists" element={<RequireLogin feature="playlists"><PlaylistsPage /></RequireLogin>} />
              <Route path="/playlists/:id" element={<RequireLogin feature="playlists"><PlaylistPage /></RequireLogin>} />
              <Route path="/favorites" element={<RequireLogin feature="favorites"><FavoritesPage /></RequireLogin>} />
              <Route path="*" element={<p className="text-zinc-400">Page not found.</p>} />
            </Routes>
          </main>
          <PlayerBar />
        </div>
      </FavoritesProvider>
    </AudioPlayerProvider>
  );
}

export default function App() {
  return (
    <AuthProvider>
      <Shell />
    </AuthProvider>
  );
}
