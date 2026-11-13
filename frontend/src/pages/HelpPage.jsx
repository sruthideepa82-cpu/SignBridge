import { AlertTriangle, Camera, ChevronRight, Keyboard, Route } from 'lucide-react';
import { Link } from 'react-router-dom';
import { AppPageHeader, Panel } from '../components/app/ui.jsx';

const MORE_TOOLS = [
  { label: 'Voice to Text', to: '/voice-to-text' },
  { label: 'ISL Dictionary', to: '/learn/dictionary' },
  { label: 'Guided Learning', to: '/learn/lessons' },
  { label: 'Practice Lab', to: '/learn/practice' },
  { label: 'Dataset Contribution', to: '/contribute' },
  { label: 'Dataset Collector', to: '/contribute/collector' },
  { label: 'Fingerspelling', to: '/fingerspelling' },
  { label: 'Community & Feedback', to: '/community' },
];

const STEPS = [
  'Open Live Studio and press Start Camera. Allow camera access if your browser asks.',
  'Make sure the SignBridge backend is running. The status badge at the top of Live Studio shows whether it is connected.',
  'Sign one letter at a time and hold it steady. A letter is added to the draft after a short hold.',
  'Check the draft, correct it if needed, then press Send to conversation. Nothing is sent before that.',
];

const TIPS = [
  'Sit so that your hand and face are fully in the frame, about an arm’s length from the camera.',
  'Use even light on your hand. Avoid strong light behind you.',
  'With two hands in view, a letter is shown only when the hands agree. Otherwise it stays UNKNOWN.',
  'Hold the sign steady with the palm towards the camera.',
];

const SHORTCUTS = [
  ['Ctrl/⌘ + K', 'Search pages'],
  ['Enter', 'Send the message you are typing'],
  ['Shift + Enter', 'New line in a message'],
  ['Escape', 'Close menus, dialogs and edit boxes'],
  ['Tab', 'Move between controls'],
];

export default function HelpPage() {
  return (
    <div className="mx-auto flex w-full max-w-4xl flex-col gap-6 px-4 py-6 sm:px-6 lg:px-8">
      <AppPageHeader
        eyebrow="Account"
        title="Help & Support"
        description="How to get a good result from Live Studio, what the pilot can and cannot do, and where your data lives."
      />

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Getting started" labelledBy="help-start-title">
          <ol className="flex flex-col gap-3">
            {STEPS.map((step, index) => (
              <li key={step} className="flex gap-3 text-sm leading-relaxed text-app-muted">
                <span className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full bg-accent/15 text-xs font-semibold text-accent">
                  {index + 1}
                </span>
                <span>{step}</span>
              </li>
            ))}
          </ol>
        </Panel>

        <Panel title="Camera tips" labelledBy="help-camera-title" actions={<Camera size={16} aria-hidden="true" className="text-app-muted" />}>
          <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-app-muted">
            {TIPS.map((tip) => (
              <li key={tip} className="flex gap-2.5">
                <span aria-hidden="true" className="mt-2 h-1 w-1 shrink-0 rounded-full bg-accent" />
                <span>{tip}</span>
              </li>
            ))}
          </ul>
        </Panel>
      </div>

      <div className="grid gap-6 md:grid-cols-2">
        <Panel title="Keyboard shortcuts" labelledBy="help-keys-title" actions={<Keyboard size={16} aria-hidden="true" className="text-app-muted" />}>
          <dl className="divide-y divide-app-border text-sm">
            {SHORTCUTS.map(([keys, action]) => (
              <div key={keys} className="flex items-center justify-between gap-4 py-2.5 first:pt-0 last:pb-0">
                <dt>
                  <kbd className="rounded-md border border-app-border bg-app-bg px-1.5 py-0.5 font-mono text-xs text-app-text">{keys}</kbd>
                </dt>
                <dd className="text-right text-app-muted">{action}</dd>
              </div>
            ))}
          </dl>
        </Panel>

        <Panel title="What to expect" labelledBy="help-limits-title" actions={<AlertTriangle size={16} aria-hidden="true" className="text-warning" />}>
          <ul className="flex flex-col gap-2.5 text-sm leading-relaxed text-app-muted">
            <li>The pilot recognises a small set of Indian Sign Language letters. It does not translate full sentences.</li>
            <li>Recognition can be wrong. Low-confidence frames show no sign, and you can correct the draft before sending.</li>
            <li>SignBridge does not replace a qualified interpreter in medical, legal or emergency situations.</li>
          </ul>
        </Panel>
      </div>

      <Panel title="More tools" labelledBy="help-tools-title">
        <ul className="grid gap-2 sm:grid-cols-2">
          {MORE_TOOLS.map((tool) => (
            <li key={tool.to}>
              <Link
                to={tool.to}
                className="flex items-center justify-between gap-3 rounded-lg border border-app-border px-3.5 py-2.5 text-sm text-app-text transition-colors hover:border-accent/40 hover:bg-accent/[0.05] focus-visible:outline-2 focus-visible:outline-accent"
              >
                {tool.label}
                <ChevronRight size={15} aria-hidden="true" className="text-app-muted" />
              </Link>
            </li>
          ))}
        </ul>
      </Panel>

      <Panel title="Where your data lives" labelledBy="help-data-title" actions={<Route size={16} aria-hidden="true" className="text-app-muted" />}>
        <p className="text-sm leading-relaxed text-app-muted">
          Conversations, saved phrases and practice progress are stored in this browser only. You can review or erase them
          in Settings. Camera frames are processed by the SignBridge backend on the computer that runs it.
        </p>
      </Panel>
    </div>
  );
}
