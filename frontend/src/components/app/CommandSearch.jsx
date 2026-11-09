import { Search } from 'lucide-react';
import { useEffect, useId, useMemo, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { APP_FOOTER_ITEMS, APP_SECTIONS } from '../../config/appNavigation.js';

const ALL_PAGES = [
  ...APP_SECTIONS.flatMap((section) => section.items.map((item) => ({ ...item, section: section.label }))),
  ...APP_FOOTER_ITEMS.map((item) => ({ ...item, section: 'Account' })),
];

export default function CommandSearch() {
  const [query, setQuery] = useState('');
  const [active, setActive] = useState(0);
  const inputRef = useRef(null);
  const listId = useId();
  const navigate = useNavigate();

  const results = useMemo(() => {
    const term = query.trim().toLowerCase();
    if (!term) return [];
    return ALL_PAGES.filter((page) => `${page.label} ${page.section}`.toLowerCase().includes(term)).slice(0, 8);
  }, [query]);

  useEffect(() => {
    const onShortcut = (event) => {
      if ((event.metaKey || event.ctrlKey) && event.key.toLowerCase() === 'k') {
        event.preventDefault();
        inputRef.current?.focus();
      }
    };
    window.addEventListener('keydown', onShortcut);
    return () => window.removeEventListener('keydown', onShortcut);
  }, []);

  const go = (page) => {
    setQuery('');
    setActive(0);
    navigate(page.to);
  };

  const onKeyDown = (event) => {
    if (event.key === 'ArrowDown') {
      event.preventDefault();
      setActive((index) => Math.min(index + 1, Math.max(results.length - 1, 0)));
    } else if (event.key === 'ArrowUp') {
      event.preventDefault();
      setActive((index) => Math.max(index - 1, 0));
    } else if (event.key === 'Enter' && results[active]) {
      event.preventDefault();
      go(results[active]);
    } else if (event.key === 'Escape') {
      setQuery('');
      inputRef.current?.blur();
    }
  };

  const open = query.trim().length > 0;

  return (
    <div className="relative w-full max-w-md">
      <label className="flex items-center gap-2.5 rounded-xl border border-white/10 bg-white/[0.03] px-4 py-2.5 text-sm text-app-muted transition-colors focus-within:border-lime-signal/60">
        <Search size={15} aria-hidden="true" />
        <span className="sr-only">Search pages</span>
        <input
          ref={inputRef}
          type="search"
          value={query}
          onChange={(event) => {
            setQuery(event.target.value);
            setActive(0);
          }}
          onKeyDown={onKeyDown}
          placeholder="Search pages, signs, or lessons…"
          aria-label="Search pages"
          role="combobox"
          aria-expanded={open && results.length > 0}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={results[active] ? `${listId}-${active}` : undefined}
          className="min-w-0 flex-1 bg-transparent text-app-text placeholder:text-app-muted focus:outline-none [&::-webkit-search-cancel-button]:appearance-none"
        />
        <kbd className="hidden rounded border border-app-border px-1.5 py-0.5 text-[10px] text-app-muted sm:inline">Ctrl K</kbd>
      </label>

      {open && (
        <ul
          id={listId}
          role="listbox"
          aria-label="Matching pages"
          className="absolute left-0 right-0 top-12 z-50 overflow-hidden rounded-xl border border-app-border bg-app-surface p-1 shadow-2xl shadow-black/50"
        >
          {results.length === 0 && <li className="px-3 py-2 text-sm text-app-muted">No matching pages</li>}
          {results.map((page, index) => {
            const Icon = page.icon;
            return (
              <li
                key={page.to}
                id={`${listId}-${index}`}
                role="option"
                aria-selected={index === active}
                onMouseEnter={() => setActive(index)}
                onMouseDown={(event) => {
                  event.preventDefault();
                  go(page);
                }}
                className={`flex cursor-pointer items-center gap-3 rounded-lg px-3 py-2 text-sm ${
                  index === active ? 'bg-white/5 text-app-text' : 'text-app-muted'
                }`}
              >
                <Icon size={15} aria-hidden="true" />
                <span className="flex-1 truncate">{page.label}</span>
                <span className="text-xs text-app-muted">{page.section}</span>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
