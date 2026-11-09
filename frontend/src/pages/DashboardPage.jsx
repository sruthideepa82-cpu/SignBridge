import { ArrowRight, Hand, MessagesSquare, Zap, Database, GraduationCap, Activity } from 'lucide-react';
import { useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import { AppPageHeader, EmptyState, Panel, StatusDot, buttonClass } from '../components/app/ui.jsx';
import useBackendHealth, { BACKEND_STATUS } from '../hooks/useBackendHealth.js';
import usePracticeProgress from '../hooks/usePracticeProgress.js';
import { ALPHABET_CARDS } from '../data/alphabetCards.js';
import { PHRASE_CATEGORIES } from '../lib/quickPhrases.js';
import { loadMessages, SPEAKERS } from '../lib/conversationStore.js';

function formatWhen(timestamp) {
  return new Date(timestamp).toLocaleString([], { dateStyle: 'medium', timeStyle: 'short' });
}

function RecentConversation({ messages }) {
  if (messages.length === 0) {
    return (
      <EmptyState icon={MessagesSquare} title="No conversations yet">
        Messages you send in Conversation Space are kept in this browser and listed here.
      </EmptyState>
    );
  }
  const last = messages[messages.length - 1];
  return (
    <div className="flex items-start justify-between gap-4">
      <div className="min-w-0">
        <p className="truncate text-sm text-app-text">{last.text}</p>
        <p className="mt-1 text-xs text-app-muted">
          {SPEAKERS[last.speaker]} · {formatWhen(last.at)} · {messages.length} message{messages.length === 1 ? '' : 's'}
        </p>
      </div>
      <Link to="/conversation" className="shrink-0 text-xs font-medium text-lime-signal hover:underline">
        Open
      </Link>
    </div>
  );
}

function SystemRow({ label, tone, detail }) {
  return (
    <li className="flex items-start justify-between gap-4 py-2.5">
      <div className="flex items-center gap-2.5">
        <StatusDot tone={tone} />
        <span className="text-sm text-app-text">{label}</span>
      </div>
      <span className="max-w-[60%] text-right text-xs text-app-muted">{detail}</span>
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

  const backendTone = backend.status === BACKEND_STATUS.ONLINE ? 'ok' : backend.status === BACKEND_STATUS.OFFLINE ? 'error' : 'neutral';
  const backendDetail =
    backend.status === BACKEND_STATUS.ONLINE
      ? 'Connected'
      : backend.status === BACKEND_STATUS.OFFLINE
        ? 'Unreachable. Start the SignBridge backend.'
        : 'Checking…';

  return (
    <div className="mx-auto flex w-full max-w-6xl flex-col gap-8 px-4 py-8 sm:px-6 lg:px-8">
      <AppPageHeader
        eyebrow="Overview"
        title="Welcome to SignBridge"
        description="Pick up where you left off, or start a conversation. Panels below show only what is saved on this device or reported by the system."
        actions={
          <Link to="/conversation" className={buttonClass('primary')}>
            Start communicating
            <ArrowRight size={15} aria-hidden="true" />
          </Link>
        }
      />

      <div className="grid gap-6 lg:grid-cols-5">
        <div className="flex min-w-0 flex-col gap-6 lg:col-span-3">
          <Panel title="Start a conversation" description="Choose how you want to communicate.">
            <ul className="grid gap-3 sm:grid-cols-2">
              {[
                { to: '/translator', label: 'Sign to Voice', icon: Hand, text: 'Sign to the camera and hear the result.' },
                { to: '/voice-to-text', label: 'Voice to Text', icon: Zap, text: 'Speak and read the words as text.' },
                { to: '/quick-connect', label: 'Quick Connect', icon: Zap, text: 'Choose a phrase and show it large.' },
                { to: '/conversation', label: 'Conversation Space', icon: MessagesSquare, text: 'Exchange messages in both directions.' },
              ].map((item) => {
                const Icon = item.icon;
                return (
                  <li key={item.to}>
                    <Link
                      to={item.to}
                      className="group flex h-full items-start gap-3 rounded-lg border border-app-border bg-app-bg px-4 py-3 transition-colors hover:border-white/20 focus-visible:outline-2 focus-visible:outline-lime-signal"
                    >
                      <Icon size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-lime-signal" />
                      <span className="min-w-0">
                        <span className="block text-sm font-medium text-app-text">{item.label}</span>
                        <span className="mt-0.5 block text-xs leading-relaxed text-app-muted">{item.text}</span>
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          </Panel>

          <Panel title="Recent conversations">
            <RecentConversation messages={messages} />
          </Panel>

          <Panel title="Recent translation activity">
            <EmptyState icon={Hand} title="No translations in this session">
              Sign to Voice keeps its history for the current visit only. Nothing is saved to your account.
            </EmptyState>
          </Panel>
        </div>

        <div className="flex min-w-0 flex-col gap-6 lg:col-span-2">
          <Panel title="Quick Connect" description="Open a phrase board for a situation.">
            <ul className="space-y-1">
              {PHRASE_CATEGORIES.map((category) => (
                <li key={category.id}>
                  <Link
                    to={`/quick-connect?category=${category.id}`}
                    className="flex items-center justify-between rounded-lg px-3 py-2 text-sm text-app-text transition-colors hover:bg-white/5 focus-visible:outline-2 focus-visible:outline-lime-signal"
                  >
                    {category.label}
                    <span className="text-xs text-app-muted">{category.phrases.length} phrases</span>
                  </Link>
                </li>
              ))}
            </ul>
          </Panel>

          <Panel title="Learning progress" description="Letters you have marked as practised in this browser.">
            <div className="flex items-center gap-3">
              <GraduationCap size={17} aria-hidden="true" className="shrink-0 text-app-muted" />
              <div className="min-w-0 flex-1">
                <div className="flex items-center justify-between text-sm">
                  <span className="text-app-text">
                    {practisedLetters} of {ALPHABET_CARDS.length} pilot letters
                  </span>
                  <span className="text-xs text-app-muted">{progressPercent}%</span>
                </div>
                <div className="mt-2 h-1.5 overflow-hidden rounded-full bg-white/5" role="progressbar" aria-valuemin={0} aria-valuemax={ALPHABET_CARDS.length} aria-valuenow={practisedLetters} aria-label="Pilot letters practised">
                  <div className="h-full rounded-full bg-lime-signal transition-[width] duration-500" style={{ width: `${progressPercent}%` }} />
                </div>
              </div>
            </div>
            <Link to="/learn/practice" className="mt-4 inline-block text-xs font-medium text-lime-signal hover:underline">
              Open Practice Lab
            </Link>
          </Panel>

          <Panel title="Dataset contribution">
            <div className="flex items-start gap-3">
              <Database size={17} aria-hidden="true" className="mt-0.5 shrink-0 text-app-muted" />
              <p className="text-xs leading-relaxed text-app-muted">
                Contributions are not connected to this workspace yet. Nothing is recorded or uploaded from here.
              </p>
            </div>
          </Panel>

          <Panel title="System status">
            <ul className="divide-y divide-app-border">
              <SystemRow label="Backend" tone={backendTone} detail={backendDetail} />
              <SystemRow label="Camera" tone="neutral" detail="Checked on Sign to Voice" />
              <SystemRow label="Recognition model" tone="neutral" detail="Checked on Sign to Voice" />
            </ul>
          </Panel>
        </div>
      </div>

      <p className="flex items-center gap-2 text-xs text-app-muted">
        <Activity size={13} aria-hidden="true" />
        Learning progress and conversations stay in this browser.
      </p>
    </div>
  );
}
