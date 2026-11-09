import {
  ArrowRight,
  Briefcase,
  BookOpen,
  Camera,
  ChevronRight,
  Clock,
  Cloud,
  Cpu,
  GraduationCap,
  Hand,
  LayoutGrid,
  Mic,
  Network,
  Play,
  Plane,
  Settings2,
  ShoppingBag,
  Siren,
  Stethoscope,
  Volume2,
  Activity,
} from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import useBackendHealth, { BACKEND_STATUS } from '../hooks/useBackendHealth.js';
import usePracticeProgress from '../hooks/usePracticeProgress.js';
import { ALPHABET_CARDS } from '../data/alphabetCards.js';
import { PHRASE_CATEGORIES } from '../lib/quickPhrases.js';
import { loadMessages, SPEAKERS } from '../lib/conversationStore.js';
import { USER_PROFILE } from '../config/userProfile.js';

const TOOL_ICONS = {
  healthcare: Stethoscope,
  education: GraduationCap,
  travel: Plane,
  shopping: ShoppingBag,
  workplace: Briefcase,
  emergency: Siren,
};

const QUICK_ACTIONS = [
  { to: '/translator', label: 'Sign to Voice', text: 'Translate signs to speech', icon: Camera },
  { to: '/voice-to-text', label: 'Voice to Text', text: 'Convert speech to readable text', icon: Mic },
  { to: '/quick-connect', label: 'Quick Connect', text: 'Use ready phrases instantly', icon: LayoutGrid },
  { to: '/learn/lessons', label: 'Learn ISL', text: 'Explore lessons and practice', icon: BookOpen },
];

function formatAgo(timestamp) {
  const minutes = Math.round((Date.now() - timestamp) / 60000);
  if (minutes < 1) return 'Just now';
  if (minutes < 60) return `${minutes} min ago`;
  const hours = Math.round(minutes / 60);
  if (hours < 24) return `${hours} hr ago`;
  return new Date(timestamp).toLocaleDateString([], { dateStyle: 'medium' });
}

function Card({ className = '', children, labelledBy }) {
  return (
    <section
      aria-labelledby={labelledBy}
      className={`rounded-2xl border border-white/10 bg-gradient-to-b from-white/[0.06] to-white/[0.015] p-6 ${className}`}
    >
      {children}
    </section>
  );
}

function CardHeader({ icon: Icon, id, title, action }) {
  return (
    <div className="mb-5 flex items-center justify-between gap-3">
      <div className="flex items-center gap-3">
        <Icon size={20} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-lime-signal" />
        <h2 id={id} className="text-lg font-semibold text-app-text">
          {title}
        </h2>
      </div>
      {action}
    </div>
  );
}

function ViewLink({ to, children }) {
  return (
    <Link to={to} className="inline-flex shrink-0 items-center gap-1.5 text-sm font-medium text-lime-signal hover:underline">
      {children}
      <ArrowRight size={14} aria-hidden="true" />
    </Link>
  );
}

function FocusIllustration() {
  return (
    <div className="relative mx-auto h-64 w-64 shrink-0 sm:h-72 sm:w-72" aria-hidden="true">
      <div className="absolute inset-4 rotate-6 rounded-3xl border border-lime-signal/25 bg-lime-signal/5" />
      <div className="absolute inset-0 -rotate-3 rounded-3xl border border-white/15 bg-gradient-to-br from-white/20 via-white/5 to-lime-signal/25 shadow-[0_0_60px_rgba(182,255,0,0.2)] backdrop-blur-md" />
      <span className="absolute -left-3 -top-3 h-10 w-10 rounded-tl-xl border-l-2 border-t-2 border-lime-signal" />
      <span className="absolute -right-3 -top-3 h-10 w-10 rounded-tr-xl border-r-2 border-t-2 border-lime-signal" />
      <span className="absolute -bottom-3 -left-3 h-10 w-10 rounded-bl-xl border-b-2 border-l-2 border-lime-signal" />
      <span className="absolute -bottom-3 -right-3 h-10 w-10 rounded-br-xl border-b-2 border-r-2 border-lime-signal" />
      <div className="absolute inset-0 flex items-center justify-center">
        <Hand size={132} strokeWidth={1.25} className="text-lime-signal drop-shadow-[0_0_28px_rgba(182,255,0,0.55)]" />
      </div>
    </div>
  );
}

function ActivityRow({ message }) {
  const Icon = message.speaker === 'deaf' ? Hand : Mic;
  return (
    <li className="flex items-center gap-4 py-3.5">
      <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lime-signal">
        <Icon size={17} aria-hidden="true" />
      </span>
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-app-text">{SPEAKERS[message.speaker]}</p>
        <p className="truncate text-xs text-app-muted">{message.text}</p>
      </div>
      <time dateTime={new Date(message.at).toISOString()} className="shrink-0 text-xs text-app-muted">
        {formatAgo(message.at)}
      </time>
    </li>
  );
}

function StatusRow({ icon: Icon, label, detail, tone, value }) {
  const valueColour = { ok: 'text-lime-signal', error: 'text-red-300', neutral: 'text-app-muted' }[tone];
  return (
    <li className="flex items-center justify-between gap-4 py-3.5">
      <div className="flex min-w-0 items-center gap-3">
        <Icon size={17} strokeWidth={1.8} aria-hidden="true" className="shrink-0 text-app-muted" />
        <div className="min-w-0">
          <p className="text-sm text-app-text">{label}</p>
          <span className="block truncate text-xs text-app-muted">{detail}</span>
        </div>
      </div>
      <span className={`flex shrink-0 items-center gap-2 text-sm font-medium ${valueColour}`}>
        <span
          className={`inline-block h-2 w-2 rounded-full ${
            { ok: 'bg-lime-signal', error: 'bg-red-400', neutral: 'bg-app-muted' }[tone]
          }`}
          aria-hidden="true"
        />
        {value}
      </span>
    </li>
  );
}

export default function DashboardPage() {
  const [messages] = useState(() => loadMessages());
  const { practised } = usePracticeProgress();
  const backend = useBackendHealth();

  const practisedLetters = useMemo(
    () => ALPHABET_CARDS.filter((card) => practised.includes(card.letter)).length,
    [practised],
  );
  const progressPercent = ALPHABET_CARDS.length === 0 ? 0 : Math.round((practisedLetters / ALPHABET_CARDS.length) * 100);
  const recentMessages = useMemo(() => messages.slice(-3).reverse(), [messages]);
  const speechAvailable = typeof window !== 'undefined' && 'speechSynthesis' in window;

  const backendOnline = backend.status === BACKEND_STATUS.ONLINE;
  const backendOffline = backend.status === BACKEND_STATUS.OFFLINE;
  const backendValue = backendOnline ? 'Connected' : backendOffline ? 'Unreachable' : 'Checking…';
  const backendTone = backendOnline ? 'ok' : backendOffline ? 'error' : 'neutral';
  const backendDetail = backendOffline ? 'Start the SignBridge backend.' : 'Local API server';

  return (
    <div className="mx-auto flex w-full max-w-7xl flex-col gap-6 px-4 py-8 sm:px-6 lg:px-8">
      <header className="relative flex flex-col gap-6 overflow-hidden pb-2 sm:flex-row sm:items-center sm:justify-between">
        <svg
          aria-hidden="true"
          className="pointer-events-none absolute -top-2 right-0 hidden h-28 w-[48%] md:block"
          viewBox="0 0 400 120"
          preserveAspectRatio="none"
          fill="none"
        >
          <path d="M0 30 C120 100 200 10 300 70 S380 95 400 90" stroke="#b6ff00" strokeWidth="6" opacity="0.12" />
          <path d="M0 30 C120 100 200 10 300 70 S380 95 400 90" stroke="#b6ff00" strokeWidth="1.5" opacity="0.9" />
        </svg>
        <div className="relative min-w-0">
          <h1 className="text-4xl font-bold tracking-tight text-app-text sm:text-5xl">
            Welcome back, {USER_PROFILE.firstName} <span aria-hidden="true">👋</span>
          </h1>
          <p className="mt-2 text-lg text-app-muted">Communicate, learn and connect without barriers.</p>
        </div>
        <Link
          to="/conversation"
          className="relative inline-flex shrink-0 items-center gap-3 self-start rounded-xl bg-lime-signal px-6 py-4 text-base font-semibold text-black shadow-[0_0_30px_rgba(182,255,0,0.25)] transition-all duration-150 hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal active:scale-[0.98] sm:self-auto"
        >
          Start Communicating
          <ArrowRight size={18} aria-hidden="true" />
        </Link>
      </header>

      <div className="grid gap-6 xl:grid-cols-[1.45fr_1fr]">
        <Card className="relative flex flex-col overflow-hidden md:flex-row md:items-center md:gap-8" labelledBy="focus-heading">
          <div className="relative z-10 flex min-w-0 flex-1 flex-col gap-5 py-2">
            <span className="inline-flex w-fit rounded-lg border border-lime-signal/20 bg-lime-signal/15 px-3 py-1.5 text-xs font-semibold uppercase tracking-wider text-lime-signal">
              Today&apos;s focus
            </span>
            <h2 id="focus-heading" className="text-4xl font-bold leading-[1.05] tracking-tight text-app-text sm:text-5xl">
              Break the
              <span className="block">Communication</span>
              <span className="block text-lime-signal">Barrier</span>
            </h2>
            <p className="max-w-md text-base leading-relaxed text-app-muted">
              Translate signs, convert speech to text, use ready phrases or learn Indian Sign Language — all in one place.
            </p>
          </div>
          <FocusIllustration />
        </Card>

        <Card labelledBy="quick-actions-heading">
          <CardHeader icon={Settings2} id="quick-actions-heading" title="Quick Actions" />
          <ul className="grid gap-4 sm:grid-cols-2">
            {QUICK_ACTIONS.map((action) => {
              const Icon = action.icon;
              return (
                <li key={action.to}>
                  <Link
                    to={action.to}
                    className="group flex h-full items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4 transition-colors hover:border-lime-signal/40 hover:bg-lime-signal/5 focus-visible:outline-2 focus-visible:outline-lime-signal"
                  >
                    <span className="flex h-14 w-14 shrink-0 items-center justify-center rounded-xl border border-white/10 bg-white/5 text-lime-signal">
                      <Icon size={22} strokeWidth={1.8} aria-hidden="true" />
                    </span>
                    <span className="min-w-0">
                      <span className="block text-base font-semibold text-app-text">{action.label}</span>
                      <span className="mt-1 block text-sm leading-snug text-app-muted">{action.text}</span>
                    </span>
                  </Link>
                </li>
              );
            })}
          </ul>
        </Card>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.3fr_1.25fr_1fr]">
        <Card labelledBy="recent-activity-heading">
          <CardHeader icon={Clock} id="recent-activity-heading" title="Recent Activity" action={<ViewLink to="/conversation">View All</ViewLink>} />
          {recentMessages.length === 0 ? (
            <div className="rounded-xl border border-dashed border-white/10 px-4 py-8 text-center">
              <p className="text-sm font-medium text-app-text">No activity yet</p>
              <p className="mt-1 text-xs leading-relaxed text-app-muted">
                Messages you send in Conversation Space are kept in this browser and listed here.
              </p>
            </div>
          ) : (
            <ul className="divide-y divide-white/10">
              {recentMessages.map((message) => (
                <ActivityRow key={message.id} message={message} />
              ))}
            </ul>
          )}
        </Card>

        <Card labelledBy="continue-learning-heading">
          <CardHeader icon={GraduationCap} id="continue-learning-heading" title="Continue Learning" action={<ViewLink to="/learn/lessons">View Path</ViewLink>} />
          <div className="flex items-center gap-4 rounded-xl border border-white/10 bg-white/[0.03] p-4">
            <span className="flex h-20 w-20 shrink-0 items-center justify-center rounded-xl bg-gradient-to-br from-lime-signal/30 via-white/5 to-transparent text-lime-signal">
              <Hand size={36} strokeWidth={1.6} aria-hidden="true" />
            </span>
            <div className="min-w-0 flex-1">
              <p className="text-base font-semibold text-app-text">Beginner ISL</p>
              <p className="mt-0.5 text-sm text-app-muted">
                {practisedLetters} of {ALPHABET_CARDS.length} pilot letters
              </p>
              <div className="mt-3 flex items-center gap-3">
                <div className="h-2 flex-1 overflow-hidden rounded-full bg-white/10" role="progressbar" aria-valuemin={0} aria-valuemax={ALPHABET_CARDS.length} aria-valuenow={practisedLetters} aria-label="Pilot letters practised">
                  <div className="h-full rounded-full bg-lime-signal shadow-[0_0_12px_rgba(182,255,0,0.6)] transition-[width] duration-500" style={{ width: `${progressPercent}%` }} />
                </div>
                <span className="text-sm text-app-muted">{progressPercent}%</span>
              </div>
            </div>
            <Link
              to="/learn/practice"
              aria-label="Open Practice Lab"
              className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-lime-signal text-black transition-all hover:brightness-110 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal active:scale-[0.96]"
            >
              <Play size={18} fill="currentColor" aria-hidden="true" />
            </Link>
          </div>
        </Card>

        <Card labelledBy="system-status-heading">
          <CardHeader icon={Activity} id="system-status-heading" title="System Status" />
          <ul className="divide-y divide-white/10">
            <StatusRow icon={Camera} label="Camera" detail="Checked on Sign to Voice" tone="neutral" value="Not checked" />
            <StatusRow icon={Cpu} label="AI Model" detail="Checked on Sign to Voice" tone="neutral" value="Not checked" />
            <StatusRow icon={Cloud} label="Backend" detail={backendDetail} tone={backendTone} value={backendValue} />
            <StatusRow
              icon={Volume2}
              label="Speech Output"
              detail="Browser text-to-speech"
              tone={speechAvailable ? 'ok' : 'error'}
              value={speechAvailable ? 'Ready' : 'Unavailable'}
            />
          </ul>
        </Card>
      </div>

      <Card labelledBy="tools-heading">
        <CardHeader icon={Network} id="tools-heading" title="Explore Communication Tools" />
        <ul className="grid gap-3 sm:grid-cols-2 xl:grid-cols-6">
          {PHRASE_CATEGORIES.filter((category) => TOOL_ICONS[category.id]).map((category) => {
            const Icon = TOOL_ICONS[category.id];
            return (
              <li key={category.id}>
                <Link
                  to={`/quick-connect?category=${category.id}`}
                  className="group flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.03] px-5 py-4 transition-colors hover:border-lime-signal/40 hover:bg-lime-signal/5 focus-visible:outline-2 focus-visible:outline-lime-signal"
                >
                  <span className="flex items-center gap-3">
                    <Icon size={22} strokeWidth={1.8} aria-hidden="true" className="text-lime-signal" />
                    <span className="text-sm font-medium text-app-text">{category.label}</span>
                  </span>
                  <ChevronRight size={16} aria-hidden="true" className="text-app-muted transition-transform group-hover:translate-x-0.5" />
                </Link>
              </li>
            );
          })}
        </ul>
      </Card>

      <p className="flex items-center gap-2 text-xs text-app-muted">
        <Activity size={13} aria-hidden="true" />
        Learning progress and conversations stay in this browser.
      </p>
    </div>
  );
}
