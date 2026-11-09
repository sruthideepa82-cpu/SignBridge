import { LoaderCircle, Play, Square } from 'lucide-react';
import { CAMERA_STATUS } from '../../hooks/useCamera.js';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition-all duration-200 ease-out focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-lime-signal disabled:cursor-not-allowed disabled:opacity-40';

export default function CameraControls({ status, onStart, onStop }) {
  const isStarting = status === CAMERA_STATUS.STARTING;
  const isLive = status === CAMERA_STATUS.LIVE;

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onStart}
        disabled={isLive || isStarting}
        className={`${BUTTON_BASE} bg-lime-signal text-black shadow-[0_0_24px_-6px_rgba(182,255,0,0.7)] enabled:hover:-translate-y-0.5 enabled:hover:shadow-[0_0_32px_-4px_rgba(182,255,0,0.9)] enabled:active:translate-y-0 enabled:active:scale-[0.98]`}
      >
        {isStarting ? (
          <LoaderCircle size={18} className="animate-spin" aria-hidden="true" />
        ) : (
          <Play size={18} aria-hidden="true" />
        )}
        {isStarting ? 'Starting…' : 'Start Camera'}
      </button>

      <button
        type="button"
        onClick={onStop}
        disabled={!isLive}
        className={`${BUTTON_BASE} bg-white/[0.04] text-zinc-200 ring-1 ring-white/10 enabled:hover:bg-white/[0.08] enabled:active:scale-[0.98]`}
      >
        <Square size={16} aria-hidden="true" />
        Stop Camera
      </button>
    </div>
  );
}
