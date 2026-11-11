import { Bell, ChevronRight, Menu, Type } from 'lucide-react';
import { Link, useLocation } from 'react-router-dom';
import BackendStatusIndicator from '../common/BackendStatusIndicator.jsx';
import useBackendHealth from '../../hooks/useBackendHealth.js';
import { findAppItem, APP_FOOTER_ITEMS } from '../../config/appNavigation.js';
import { USER_PROFILE } from '../../config/userProfile.js';
import { TEXT_SCALES, useTextScale } from '../../hooks/useAppPreferences.js';
import CommandSearch from './CommandSearch.jsx';
import Popover from './Popover.jsx';

function Breadcrumbs({ pathname }) {
  const item = findAppItem(pathname);
  const crumbs = item ? [item.section, item.label] : [pathname.replace(/^\//, '') || 'Overview'];
  return (
    <nav aria-label="Breadcrumb" className="min-w-0">
      <ol className="flex min-w-0 items-center gap-1.5 text-sm">
        <li className="shrink-0 text-app-muted">SignBridge</li>
        {crumbs.map((crumb, index) => (
          <li key={crumb} className="flex min-w-0 items-center gap-1.5">
            <ChevronRight size={13} aria-hidden="true" className="shrink-0 text-app-muted" />
            <span
              className={`truncate ${index === crumbs.length - 1 ? 'font-medium text-app-text' : 'text-app-muted'}`}
              aria-current={index === crumbs.length - 1 ? 'page' : undefined}
            >
              {crumb}
            </span>
          </li>
        ))}
      </ol>
    </nav>
  );
}

function NotificationsPanel() {
  return (
    <div className="p-2">
      <p className="px-2 pb-2 text-sm font-semibold text-app-text">Notifications</p>
      <div className="rounded-lg border border-dashed border-app-border px-4 py-6 text-center">
        <p className="text-sm text-app-text">No notifications yet</p>
        <p className="mt-1 text-xs leading-relaxed text-app-muted">
          Activity from your sessions will appear here once there is something to report.
        </p>
      </div>
    </div>
  );
}

function AccessibilityPanel({ scaleId, onChange }) {
  return (
    <div className="p-2">
      <p className="px-2 pb-2 text-sm font-semibold text-app-text">Accessibility</p>
      <fieldset className="px-2">
        <legend className="pb-2 text-xs text-app-muted">Text size</legend>
        <div className="grid grid-cols-3 gap-1.5" role="radiogroup">
          {TEXT_SCALES.map((scale) => {
            const selected = scale.id === scaleId;
            return (
              <button
                key={scale.id}
                type="button"
                role="radio"
                aria-checked={selected}
                onClick={() => onChange(scale.id)}
                className={`rounded-lg border px-2 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent ${
                  selected
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-app-border text-app-muted hover:text-app-text'
                }`}
              >
                {scale.label}
              </button>
            );
          })}
        </div>
      </fieldset>
      <p className="px-2 pt-3 text-xs leading-relaxed text-app-muted">
        Motion follows your system setting. Reduced motion turns off animations across the app.
      </p>
    </div>
  );
}

function ProfilePanel({ close }) {
  return (
    <div className="p-2">
      <div className="flex items-center gap-3 px-2 pb-3">
        <span className="flex h-9 w-9 items-center justify-center rounded-full bg-app-bg text-sm font-semibold text-app-text" aria-hidden="true">
          {USER_PROFILE.initials}
        </span>
        <div className="min-w-0">
          <p className="text-sm font-semibold text-app-text">{USER_PROFILE.fullName}</p>
          <p className="text-xs text-app-muted">Accounts are not available yet</p>
        </div>
      </div>
      <ul className="space-y-0.5 border-t border-app-border pt-2">
        <li>
          <Link to="/profile" onClick={close} className="block rounded-lg px-2 py-2 text-sm text-app-text hover:bg-white/5">
            Profile
          </Link>
        </li>
        {APP_FOOTER_ITEMS.map((item) => (
          <li key={item.to}>
            <Link to={item.to} onClick={close} className="block rounded-lg px-2 py-2 text-sm text-app-text hover:bg-white/5">
              {item.label}
            </Link>
          </li>
        ))}
        <li>
          <span className="block cursor-not-allowed rounded-lg px-2 py-2 text-sm text-app-muted" aria-disabled="true">
            Sign in (coming soon)
          </span>
        </li>
      </ul>
    </div>
  );
}

export default function TopBar({ onOpenMenu }) {
  const { pathname } = useLocation();
  const backend = useBackendHealth();
  const { scaleId, setScaleId } = useTextScale();

  return (
    <header className="sticky top-0 z-40 flex h-16 items-center gap-3 border-b border-app-border bg-app-bg/95 px-3 backdrop-blur-sm sm:px-6">
      <button
        type="button"
        onClick={onOpenMenu}
        aria-label="Open navigation"
        className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg text-app-muted hover:bg-white/5 hover:text-app-text md:hidden focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Menu size={18} aria-hidden="true" />
      </button>

      <div className="hidden min-w-0 flex-1 md:block">
        <Breadcrumbs pathname={pathname} />
      </div>

      <div className="flex min-w-0 flex-1 justify-end md:w-80 md:flex-none lg:w-[26rem]">
        <CommandSearch />
      </div>

      <div className="flex shrink-0 items-center gap-1 sm:gap-2">
        <div className="hidden lg:block">
          <BackendStatusIndicator status={backend.status} onRefresh={backend.refresh} dark />
        </div>
        <Popover label="Notifications" trigger={<Bell size={18} aria-hidden="true" />}>
          <NotificationsPanel />
        </Popover>
        <Popover label="Accessibility options" trigger={<Type size={17} aria-hidden="true" />}>
          <AccessibilityPanel scaleId={scaleId} onChange={setScaleId} />
        </Popover>
        <Popover
          label="Account menu"
          trigger={
            <span className="flex h-9 w-9 items-center justify-center rounded-full bg-app-surface text-xs font-semibold text-app-text ring-1 ring-white/10">
              {USER_PROFILE.initials}
            </span>
          }
        >
          {(close) => <ProfilePanel close={close} />}
        </Popover>
      </div>
    </header>
  );
}
