import { Menu, X } from 'lucide-react';
import { useState } from 'react';
import { Link, NavLink } from 'react-router-dom';
import { ROUTE_LINKS, SECTION_LINKS } from '../../data/landingContent.js';
import Logo from '../common/Logo.jsx';

const linkBaseClass = 'text-sm font-medium transition-colors';
const sectionLinkClass = `${linkBaseClass} text-slate-600 hover:text-slate-900`;
const routeLinkClass = ({ isActive }) =>
  `${linkBaseClass} ${isActive ? 'text-blue-600' : 'text-slate-600 hover:text-slate-900'}`;

export default function Navbar() {
  const [isMenuOpen, setIsMenuOpen] = useState(false);
  const closeMenu = () => setIsMenuOpen(false);

  return (
    <header className="sticky top-0 z-50 border-b border-slate-200/70 bg-white/80 backdrop-blur-md">
      <nav className="mx-auto flex h-16 max-w-7xl items-center justify-between px-4 sm:px-6 lg:px-8" aria-label="Main">
        <Link to="/" aria-label="SignBridge home" onClick={closeMenu}>
          <Logo />
        </Link>

        <ul className="hidden items-center gap-8 md:flex">
          {SECTION_LINKS.map((link) => (
            <li key={link.to}>
              <Link to={link.to} className={sectionLinkClass}>
                {link.label}
              </Link>
            </li>
          ))}
          {ROUTE_LINKS.map((link) => (
            <li key={link.to}>
              <NavLink to={link.to} className={routeLinkClass}>
                {link.label}
              </NavLink>
            </li>
          ))}
        </ul>

        <Link
          to="/live"
          className="hidden rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm font-semibold text-white shadow-md shadow-blue-600/20 transition hover:-translate-y-0.5 hover:shadow-lg md:inline-flex"
        >
          Start Communicating
        </Link>

        <button
          type="button"
          className="inline-flex h-10 w-10 items-center justify-center rounded-lg text-slate-700 hover:bg-slate-100 md:hidden"
          aria-expanded={isMenuOpen}
          aria-controls="mobile-menu"
          aria-label={isMenuOpen ? 'Close navigation menu' : 'Open navigation menu'}
          onClick={() => setIsMenuOpen((open) => !open)}
        >
          {isMenuOpen ? <X size={22} /> : <Menu size={22} />}
        </button>
      </nav>

      {isMenuOpen && (
        <div id="mobile-menu" className="border-t border-slate-200 bg-white md:hidden">
          <ul className="flex flex-col gap-1 px-4 py-4">
            {[...SECTION_LINKS, ...ROUTE_LINKS].map((link) => (
              <li key={link.to}>
                <Link
                  to={link.to}
                  onClick={closeMenu}
                  className="block rounded-lg px-3 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-100"
                >
                  {link.label}
                </Link>
              </li>
            ))}
            <li className="pt-2">
              <Link
                to="/live"
                onClick={closeMenu}
                className="block rounded-xl bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2.5 text-center text-sm font-semibold text-white"
              >
                Start Communicating
              </Link>
            </li>
          </ul>
        </div>
      )}
    </header>
  );
}
