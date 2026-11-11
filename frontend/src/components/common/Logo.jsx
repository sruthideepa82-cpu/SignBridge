import { Hand } from 'lucide-react';

export default function Logo({ dark = false, compact = false }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span
        className={
          dark
            ? 'flex h-8 w-8 shrink-0 items-center justify-center rounded-lg bg-accent text-app-bg'
            : 'flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/20'
        }
      >
        <Hand size={dark ? 17 : 20} strokeWidth={2.25} aria-hidden="true" />
      </span>
      {!compact && (
        <span className={`text-base font-semibold tracking-tight ${dark ? 'text-app-text' : 'text-slate-900'}`}>
          Sign<span className={dark ? 'text-accent' : 'text-blue-600'}>Bridge</span>
        </span>
      )}
    </span>
  );
}
