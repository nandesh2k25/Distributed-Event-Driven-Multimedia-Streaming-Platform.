import { Link, Route, Routes } from 'react-router-dom';
import { Music } from 'lucide-react';
import { SearchBar } from './components/SearchBar';
import BrowsePage from './pages/BrowsePage';
import SearchPage from './pages/SearchPage';
import AlbumPage from './pages/AlbumPage';
import ArtistPage from './pages/ArtistPage';

export default function App() {
  return (
    <div className="min-h-screen bg-zinc-950 text-zinc-50">
      <header className="sticky top-0 z-40 flex items-center gap-4 border-b border-zinc-800 bg-zinc-950/90 px-4 py-3 backdrop-blur sm:px-8">
        <Link to="/" className="flex shrink-0 items-center gap-2 font-bold">
          <Music className="h-6 w-6 text-accent" />
          <span className="hidden sm:inline">Music Library</span>
        </Link>
        <SearchBar />
      </header>
      {/* pb-24 reserves room for the fixed bottom player bar (ticket 03) */}
      <main className="mx-auto max-w-7xl px-4 py-8 pb-24 sm:px-8">
        <Routes>
          <Route path="/" element={<BrowsePage />} />
          <Route path="/search" element={<SearchPage />} />
          <Route path="/albums/:id" element={<AlbumPage />} />
          <Route path="/artists/:id" element={<ArtistPage />} />
          <Route path="*" element={<p className="text-zinc-400">Page not found.</p>} />
        </Routes>
      </main>
    </div>
  );
}
