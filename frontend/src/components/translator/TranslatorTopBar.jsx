import { Link, NavLink } from 'react-router-dom';
import BackendStatusIndicator from '../common/BackendStatusIndicator.jsx';
import Logo from '../common/Logo.jsx';

const linkClass = ({ isActive }) =>
  `text-xs font-medium transition-colors duration-200 ${isActive ? 'text-accent' : 'text-zinc-500 hover:text-zinc-200'}`;

export default function TranslatorTopBar({ backendStatus, onRefreshBackend }) {
  return (
    <header className="flex items-center justify-between gap-4 border-b border-white/[0.06] px-4 py-3 sm:px-6">
      <Link to="/" aria-label="SignBridge home" className="shrink-0">
        <Logo dark />
      </Link>

      <nav aria-label="Translator" className="flex items-center gap-5">
        <NavLink to="/" end className={linkClass}>
          Home
        </NavLink>
        <NavLink to="/learn" className={linkClass}>
          Learn
        </NavLink>
      </nav>

      <div className="hidden sm:block">
        <BackendStatusIndicator status={backendStatus} onRefresh={onRefreshBackend} dark />
      </div>
    </header>
  );
}
