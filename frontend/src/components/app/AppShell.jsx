import { X } from 'lucide-react';
import { useEffect, useState } from 'react';
import { Outlet, useLocation } from 'react-router-dom';
import { useSidebarCollapsed } from '../../hooks/useAppPreferences.js';
import Sidebar from './Sidebar.jsx';
import TopBar from './TopBar.jsx';

// The persistent application frame: sidebar, top bar and the page outlet.
// Desktop keeps the sidebar visible; on small screens it becomes a drawer.
export default function AppShell() {
  const { collapsed, toggle } = useSidebarCollapsed();
  const [drawerOpen, setDrawerOpen] = useState(false);
  const { pathname } = useLocation();

  useEffect(() => {
    setDrawerOpen(false);
  }, [pathname]);

  useEffect(() => {
    if (!drawerOpen) return undefined;
    const onKey = (event) => {
      if (event.key === 'Escape') setDrawerOpen(false);
    };
    document.addEventListener('keydown', onKey);
    return () => document.removeEventListener('keydown', onKey);
  }, [drawerOpen]);

  return (
    <div className="flex h-screen overflow-hidden bg-app-bg text-app-text">
      <a
        href="#main-content"
        className="sr-only z-[60] rounded-lg bg-accent px-3 py-2 text-sm font-semibold text-app-bg focus:not-sr-only focus:fixed focus:left-3 focus:top-3"
      >
        Skip to content
      </a>

      <div className="hidden h-full md:flex">
        <Sidebar collapsed={collapsed} onToggle={toggle} />
      </div>

      {drawerOpen && (
        <div className="fixed inset-0 z-50 flex md:hidden" role="dialog" aria-modal="true" aria-label="Navigation">
          <button
            type="button"
            aria-label="Close navigation"
            onClick={() => setDrawerOpen(false)}
            className="absolute inset-0 bg-black/60"
          />
          <div className="relative h-full">
            <Sidebar collapsed={false} showToggle={false} onNavigate={() => setDrawerOpen(false)} />
            <button
              type="button"
              aria-label="Close navigation"
              onClick={() => setDrawerOpen(false)}
              className="absolute right-2 top-3 flex h-8 w-8 items-center justify-center rounded-lg text-app-muted hover:bg-white/5 hover:text-app-text focus-visible:outline-2 focus-visible:outline-accent"
            >
              <X size={16} aria-hidden="true" />
            </button>
          </div>
        </div>
      )}

      <div className="flex min-w-0 flex-1 flex-col">
        <TopBar onOpenMenu={() => setDrawerOpen(true)} />
        <main id="main-content" tabIndex={-1} className="min-h-0 flex-1 overflow-y-auto focus:outline-none">
          <Outlet />
        </main>
      </div>
    </div>
  );
}
