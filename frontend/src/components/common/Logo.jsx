import { Hand } from 'lucide-react';

export default function Logo({ dark = false, compact = false }) {
  return (
    <span className="inline-flex items-center gap-2.5">
      <span className="flex h-9 w-9 items-center justify-center rounded-xl bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/20">
        <Hand size={20} strokeWidth={2.25} aria-hidden="true" />
      </span>
      {!compact && (
        <span className={`text-lg font-bold tracking-tight ${dark ? 'text-white' : 'text-slate-900'}`}>
          Sign<span className={dark ? 'text-lime-signal' : 'text-blue-600'}>Bridge</span>
        </span>
      )}
    </span>
  );
}
