import { ChevronRight, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { APP_FOOTER_ITEMS, APP_SECTIONS } from '../../config/appNavigation.js';
import { USER_PROFILE } from '../../config/userProfile.js';
import Logo from '../common/Logo.jsx';

function NavItem({ item, collapsed, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `group flex items-center gap-3 rounded-xl px-3 py-2.5 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-lime-signal/15 text-lime-signal shadow-[inset_0_0_0_1px_rgba(182,255,0,0.3)]'
            : 'text-app-muted hover:bg-white/5 hover:text-app-text'
        }`
      }
    >
      <Icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0" />
      {!collapsed && <span className="truncate">{item.label}</span>}
    </NavLink>
  );
}

export default function Sidebar({ collapsed = false, onToggle, onNavigate, showToggle = true }) {
  return (
    <nav
      aria-label="Main application navigation"
      className={`flex h-full flex-col border-r border-app-border bg-app-sidebar ${collapsed ? 'w-16' : 'w-72'} transition-[width] duration-200`}
    >
      <div className={`flex items-center px-6 pb-8 pt-6 ${collapsed ? 'justify-center px-3' : ''}`}>
        <NavLink to="/dashboard" onClick={onNavigate} aria-label="SignBridge overview" className="min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-lime-signal">
          {collapsed ? <Logo dark compact /> : <Logo dark />}
        </NavLink>
      </div>

      <div className="flex-1 space-y-6 overflow-y-auto px-4 pb-4">
        {APP_SECTIONS.map((section) => {
          const SectionIcon = section.icon;
          return (
            <div key={section.label}>
              {!collapsed && (
                <p className="flex items-center gap-2.5 px-3 pb-2 text-sm font-semibold text-app-text">
                  {SectionIcon && <SectionIcon size={16} strokeWidth={1.8} aria-hidden="true" className="text-lime-signal" />}
                  {section.label}
                </p>
              )}
              <ul className={`space-y-1 ${collapsed ? '' : 'pl-3'}`}>
                {section.items.map((item) => (
                  <li key={item.to}>
                    <NavItem item={item} collapsed={collapsed} onNavigate={onNavigate} />
                  </li>
                ))}
              </ul>
            </div>
          );
        })}

        <ul className="space-y-1 border-t border-app-border pt-5">
          {APP_FOOTER_ITEMS.map((item) => (
            <li key={item.to}>
              <NavItem item={item} collapsed={collapsed} onNavigate={onNavigate} />
            </li>
          ))}
        </ul>
      </div>

      <div className="space-y-1 border-t border-app-border px-4 py-4">
        <NavLink
          to="/profile"
          onClick={onNavigate}
          aria-label="Profile"
          title={collapsed ? 'Profile' : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-xl px-2.5 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal ${
              collapsed ? 'justify-center' : ''
            } ${isActive ? 'bg-lime-signal/10' : 'hover:bg-white/5'}`
          }
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-app-surface text-sm font-semibold text-app-text ring-1 ring-white/10" aria-hidden="true">
            {USER_PROFILE.initials}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-semibold text-app-text">{USER_PROFILE.fullName}</span>
                <span className="block truncate text-xs text-app-muted">{USER_PROFILE.role}</span>
              </span>
              <ChevronRight size={16} aria-hidden="true" className="shrink-0 text-app-muted" />
            </>
          )}
        </NavLink>
        {showToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex w-full items-center gap-3 rounded-xl px-3 py-2 text-sm text-app-muted transition-colors hover:bg-white/5 hover:text-app-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal ${
              collapsed ? 'justify-center' : ''
            }`}
          >
            {collapsed ? <PanelLeftOpen size={17} aria-hidden="true" /> : <PanelLeftClose size={17} aria-hidden="true" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
      </div>
    </nav>
  );
}
