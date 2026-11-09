import { PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { APP_FOOTER_ITEMS, APP_SECTIONS } from '../../config/appNavigation.js';
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
        `group flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal ${
          collapsed ? 'justify-center' : ''
        } ${
          isActive
            ? 'bg-lime-signal/10 text-lime-signal'
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
      className={`flex h-full flex-col border-r border-app-border bg-app-sidebar ${collapsed ? 'w-16' : 'w-60'} transition-[width] duration-200`}
    >
      <div className={`flex items-center gap-2 px-3 pb-3 pt-4 ${collapsed ? 'justify-center' : 'justify-between'}`}>
        <NavLink to="/dashboard" onClick={onNavigate} aria-label="SignBridge overview" className="min-w-0 rounded-lg focus-visible:outline-2 focus-visible:outline-lime-signal">
          {collapsed ? <Logo dark compact /> : <Logo dark />}
        </NavLink>
      </div>

      {!collapsed && (
        <div className="mx-3 mb-4 rounded-lg border border-app-border px-3 py-2">
          <p className="text-[11px] uppercase tracking-wider text-app-muted">Workspace</p>
          <p className="truncate text-sm text-app-text">Personal workspace</p>
        </div>
      )}

      <div className="flex-1 space-y-5 overflow-y-auto px-2 pb-4">
        {APP_SECTIONS.map((section) => (
          <div key={section.label}>
            {!collapsed && (
              <p className="px-2.5 pb-1.5 text-[11px] font-semibold uppercase tracking-wider text-app-muted">{section.label}</p>
            )}
            <ul className="space-y-0.5">
              {section.items.map((item) => (
                <li key={item.to}>
                  <NavItem item={item} collapsed={collapsed} onNavigate={onNavigate} />
                </li>
              ))}
            </ul>
          </div>
        ))}
      </div>

      <div className="space-y-0.5 border-t border-app-border px-2 py-3">
        <NavLink
          to="/profile"
          onClick={onNavigate}
          aria-label="Profile"
          title={collapsed ? 'Profile' : undefined}
          className={({ isActive }) =>
            `flex items-center gap-3 rounded-lg px-2.5 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal ${
              collapsed ? 'justify-center' : ''
            } ${isActive ? 'bg-lime-signal/10 text-lime-signal' : 'text-app-muted hover:bg-white/5 hover:text-app-text'}`
          }
        >
          <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-app-surface text-xs font-semibold text-app-text" aria-hidden="true">
            G
          </span>
          {!collapsed && <span className="truncate">Guest profile</span>}
        </NavLink>
        {APP_FOOTER_ITEMS.map((item) => (
          <NavItem key={item.to} item={item} collapsed={collapsed} onNavigate={onNavigate} />
        ))}
        {showToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`mt-1 flex w-full items-center gap-3 rounded-lg px-2.5 py-2 text-sm text-app-muted transition-colors hover:bg-white/5 hover:text-app-text focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal ${
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
