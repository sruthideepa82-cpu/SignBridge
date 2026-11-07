import { Link } from 'react-router-dom';
import { ROUTE_LINKS, SECTION_LINKS } from '../../data/landingContent.js';
import Logo from '../common/Logo.jsx';

export default function Footer() {
  const currentYear = new Date().getFullYear();

  return (
    <footer className="border-t border-slate-200 bg-white">
      <div className="mx-auto grid max-w-7xl gap-10 px-4 py-12 sm:px-6 md:grid-cols-3 lg:px-8">
        <div>
          <Link to="/" aria-label="SignBridge home">
            <Logo />
          </Link>
          <p className="mt-4 max-w-xs text-sm leading-relaxed text-slate-600">
            Breaking barriers and connecting people through accessible sign-language communication.
          </p>
        </div>

        <nav aria-label="Footer">
          <h3 className="text-sm font-semibold text-slate-900">Explore</h3>
          <ul className="mt-4 space-y-3 text-sm text-slate-600">
            {[...SECTION_LINKS, ...ROUTE_LINKS].map((link) => (
              <li key={link.to}>
                <Link to={link.to} className="transition-colors hover:text-blue-600">
                  {link.label}
                </Link>
              </li>
            ))}
          </ul>
        </nav>

        <div>
          <h3 className="text-sm font-semibold text-slate-900">Project status</h3>
          <p className="mt-4 text-sm leading-relaxed text-slate-600">
            SignBridge is an academic capstone project. The webcam pipeline is working; sign recognition,
            translation, speech output, and learning modules are still under development.
          </p>
        </div>
      </div>

      <div className="border-t border-slate-200">
        <p className="mx-auto max-w-7xl px-4 py-5 text-center text-xs text-slate-500 sm:px-6 lg:px-8">
          © {currentYear} SignBridge. Built as an academic capstone project.
        </p>
      </div>
    </footer>
  );
}
