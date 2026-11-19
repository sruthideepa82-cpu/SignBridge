import {
  BarChart3,
  ClipboardCheck,
  CalendarDays,
  Database,
  Layers,
  LayoutDashboard,
  Settings,
  ShieldCheck,
  Tags,
  Users,
} from 'lucide-react';
import { NavLink } from 'react-router-dom';
import { getStudioStatus } from '../../services/studioService.js';
import { StatusDot } from '../app/ui.jsx';
import useStudioData from './useStudioData.js';

export const STUDIO_NAV = [
  { to: '/studio', label: 'Dashboard', icon: LayoutDashboard, end: true },
  { to: '/studio/participants', label: 'Participants', icon: Users },
  { to: '/studio/consents', label: 'Consent records', icon: ShieldCheck },
  { to: '/studio/phrases', label: 'Phrase catalogue', icon: Tags },
  { to: '/studio/sessions', label: 'Recording sessions', icon: CalendarDays },
  { to: '/studio/dataset', label: 'Dataset browser', icon: Database },
  { to: '/studio/review', label: 'Review queue', icon: ClipboardCheck },
  { to: '/studio/quality', label: 'Quality reports', icon: BarChart3 },
  { to: '/studio/versions', label: 'Dataset versions', icon: Layers },
  { to: '/studio/settings', label: 'Settings', icon: Settings },
];

// The banner reads the backend status. While it loads, or if it cannot be read, collection is treated as disabled.
export function collectionBanner(status, error) {
  if (error) {
    return { tone: 'danger', title: 'PARTICIPANT COLLECTION DISABLED', text: `Studio status unavailable (${error}). Collection stays off.` };
  }
  if (!status) {
    return { tone: 'neutral', title: 'Checking collection status…', text: 'Participant collection stays off until the status is confirmed.' };
  }
  if (status.participant_collection === 'enabled') {
    return { tone: 'warning', title: 'Participant collection flag is on', text: 'Each recording still needs every gate condition to pass.' };
  }
  return {
    tone: 'danger',
    title: 'PARTICIPANT COLLECTION DISABLED',
    text: 'Recording is blocked on the server. Only the project owner can enable it. No participant data is captured here.',
  };
}

const TONE_DOT = { danger: 'error', warning: 'warn', neutral: 'neutral' };
const TONE_BOX = {
  danger: 'border-danger/40 bg-danger/5 text-danger',
  warning: 'border-warning/40 bg-warning/5 text-warning',
  neutral: 'border-app-border bg-app-surface/60 text-app-muted',
};

export default function StudioShell({ children }) {
  const status = useStudioData(getStudioStatus);
  const banner = collectionBanner(status.data, status.error);
  return (
    <div className="flex min-w-0 flex-col gap-6 lg:flex-row">
      <nav aria-label="Dataset Collection Studio" className="shrink-0 lg:w-56">
        <ul className="flex flex-col gap-1">
          {STUDIO_NAV.map(({ to, label, icon: Icon, end }) => (
            <li key={to}>
              <NavLink
                to={to}
                end={end}
                className={({ isActive }) =>
                  `flex items-center gap-2.5 rounded-lg px-3 py-2 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-accent ${
                    isActive ? 'bg-white/[0.08] text-app-text' : 'text-app-muted hover:bg-white/[0.05] hover:text-app-text'
                  }`
                }
              >
                <Icon size={16} aria-hidden="true" />
                {label}
              </NavLink>
            </li>
          ))}
        </ul>
      </nav>
      <div className="flex min-w-0 flex-1 flex-col gap-6">
        <div role="status" className={`flex items-start gap-3 rounded-xl border p-4 ${TONE_BOX[banner.tone]}`}>
          <span className="mt-1.5"><StatusDot tone={TONE_DOT[banner.tone]} /></span>
          <div className="min-w-0">
            <p className="text-sm font-semibold tracking-wide">{banner.title}</p>
            <p className="mt-1 text-sm text-app-muted">{banner.text}</p>
          </div>
        </div>
        {children}
      </div>
    </div>
  );
}
