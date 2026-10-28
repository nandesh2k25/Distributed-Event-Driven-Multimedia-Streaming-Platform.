import { useEffect, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Search } from 'lucide-react';
import { useDebounce } from '../hooks/useDebounce';

export function SearchBar() {
  const navigate = useNavigate();
  const location = useLocation();
  const [value, setValue] = useState(() => new URLSearchParams(location.search).get('q') ?? '');
  const debounced = useDebounce(value.trim(), 300);

  useEffect(() => {
    if (debounced) {
      navigate(`/search?q=${encodeURIComponent(debounced)}`, { replace: location.pathname === '/search' });
    } else if (location.pathname === '/search') {
      navigate('/', { replace: true });
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [debounced]);

  return (
    <label className="relative block w-full max-w-md">
      <span className="sr-only">Search the catalog</span>
      <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-zinc-500" />
      <input
        type="search"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder="Search tracks, artists, albums…"
        className="w-full rounded-full bg-zinc-800 py-2 pl-9 pr-4 text-sm outline-none ring-accent placeholder:text-zinc-500 focus:ring-2"
      />
    </label>
  );
}
