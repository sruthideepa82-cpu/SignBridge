import { Camera, Hand, Volume2 } from 'lucide-react';

export default function HeroIllustration() {
  return (
    <div className="relative mx-auto w-full max-w-md" aria-hidden="true">
      <div className="absolute -left-6 -top-6 h-24 w-24 rounded-full bg-blue-400/30 blur-2xl" />
      <div className="absolute -bottom-8 -right-4 h-28 w-28 rounded-full bg-violet-400/30 blur-2xl" />

      <div className="relative rounded-3xl bg-white p-6 shadow-xl shadow-slate-900/10 ring-1 ring-slate-900/5">
        <div className="flex items-center justify-between">
          <div className="flex gap-1.5">
            <span className="h-2.5 w-2.5 rounded-full bg-red-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-amber-300" />
            <span className="h-2.5 w-2.5 rounded-full bg-emerald-300" />
          </div>
          <span className="text-xs font-medium text-slate-400">Illustration</span>
        </div>

        <div className="mt-6 flex aspect-[4/3] items-center justify-center rounded-2xl bg-gradient-to-br from-blue-50 via-white to-violet-50 ring-1 ring-slate-900/5">
          <div className="relative flex h-24 w-24 items-center justify-center rounded-full bg-gradient-to-br from-blue-600 to-violet-600 text-white shadow-lg shadow-blue-600/30">
            <span className="absolute inset-0 animate-ping rounded-full bg-blue-500/20" />
            <Hand size={44} strokeWidth={1.75} />
          </div>
        </div>

        <div className="mt-5 space-y-3">
          <div className="flex items-start gap-3">
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-blue-100 text-blue-700">
              <Hand size={16} />
            </span>
            <p className="rounded-2xl rounded-tl-sm bg-slate-100 px-4 py-2 text-sm text-slate-700">
              Gesture input goes here
            </p>
          </div>
          <div className="flex items-start justify-end gap-3">
            <p className="rounded-2xl rounded-tr-sm bg-gradient-to-r from-blue-600 to-violet-600 px-4 py-2 text-sm text-white">
              Text output goes here
            </p>
            <span className="flex h-8 w-8 shrink-0 items-center justify-center rounded-full bg-violet-100 text-violet-700">
              <Volume2 size={16} />
            </span>
          </div>
        </div>
      </div>

      <div className="absolute -left-4 top-1/2 hidden items-center gap-2 rounded-2xl bg-white px-3 py-2 text-xs font-semibold text-slate-700 shadow-lg ring-1 ring-slate-900/5 sm:flex">
        <Camera size={16} className="text-blue-600" />
        Webcam ready
      </div>
    </div>
  );
}
