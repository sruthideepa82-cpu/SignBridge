import { ChevronsUpDown, PanelLeftClose, PanelLeftOpen } from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { SIDEBAR_ITEMS } from '../../config/appNavigation.js';
import { USER_PROFILE } from '../../config/userProfile.js';
import Logo from '../common/Logo.jsx';

const FOCUS = 'focus-visible:outline-2 focus-visible:outline-offset-[-2px] focus-visible:outline-accent';

function NavItem({ item, collapsed, onNavigate }) {
  const Icon = item.icon;
  return (
    <NavLink
      to={item.to}
      onClick={onNavigate}
      title={collapsed ? item.label : undefined}
      aria-label={collapsed ? item.label : undefined}
      className={({ isActive }) =>
        `flex h-10 items-center gap-3 rounded-lg text-sm transition-colors duration-150 ${FOCUS} ${
          collapsed ? 'justify-center' : 'px-3'
        } ${isActive ? 'bg-accent/20 font-medium text-app-text' : 'text-app-muted hover:bg-white/[0.05] hover:text-app-text'}`
      }
    >
      {({ isActive }) => (
        <>
          <Icon
            size={17}
            strokeWidth={1.8}
            aria-hidden="true"
            className={`shrink-0 ${isActive ? 'text-accent-hover' : ''}`}
          />
          {!collapsed && <span className="truncate">{item.label}</span>}
        </>
      )}
    </NavLink>
  );
}

export default function Sidebar({ collapsed = false, onToggle, onNavigate, showToggle = true }) {
  return (
    <nav
      aria-label="Main application navigation"
      className={`flex h-full shrink-0 flex-col border-r border-app-border bg-app-sidebar ${
        collapsed ? 'w-16' : 'w-[10.5rem]'
      } transition-[width] duration-200`}
    >
      <div className={`flex h-16 shrink-0 items-center ${collapsed ? 'justify-center' : 'px-4'}`}>
        <NavLink to="/dashboard" onClick={onNavigate} aria-label="SignBridge overview" className={`min-w-0 rounded-md ${FOCUS}`}>
          <Logo dark compact={collapsed} />
        </NavLink>
      </div>

      <ul className="flex-1 space-y-1 overflow-y-auto px-2.5 pt-2">
        {SIDEBAR_ITEMS.map((item) => (
          <li key={item.to}>
            <NavItem item={item} collapsed={collapsed} onNavigate={onNavigate} />
          </li>
        ))}
      </ul>

      <div className="space-y-1 border-t border-app-border p-2.5">
        <NavLink
          to="/profile"
          onClick={onNavigate}
          aria-label="Profile"
          title={collapsed ? 'Profile' : undefined}
          className={({ isActive }) =>
            `flex items-center gap-2.5 rounded-lg p-2 transition-colors ${FOCUS} ${collapsed ? 'justify-center' : ''} ${
              isActive ? 'bg-white/[0.06]' : 'hover:bg-white/[0.05]'
            }`
          }
        >
          <span
            className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-accent/25 text-xs font-semibold text-accent-hover"
            aria-hidden="true"
          >
            {USER_PROFILE.initials}
          </span>
          {!collapsed && (
            <>
              <span className="min-w-0 flex-1">
                <span className="block truncate text-sm font-medium text-app-text">{USER_PROFILE.fullName}</span>
                <span className="block truncate text-xs text-app-muted">{USER_PROFILE.role}</span>
              </span>
              <ChevronsUpDown size={14} aria-hidden="true" className="shrink-0 text-app-muted" />
            </>
          )}
        </NavLink>

        {showToggle && (
          <button
            type="button"
            onClick={onToggle}
            aria-label={collapsed ? 'Expand sidebar' : 'Collapse sidebar'}
            className={`flex h-8 w-full items-center gap-2.5 rounded-lg px-2.5 text-xs text-app-muted transition-colors hover:bg-white/[0.05] hover:text-app-text ${FOCUS} ${
              collapsed ? 'justify-center px-0' : ''
            }`}
          >
            {collapsed ? <PanelLeftOpen size={15} aria-hidden="true" /> : <PanelLeftClose size={15} aria-hidden="true" />}
            {!collapsed && <span>Collapse</span>}
          </button>
        )}
      </div>
    </nav>
  );
}
