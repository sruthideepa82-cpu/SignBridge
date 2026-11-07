import { LoaderCircle, Play, Square } from 'lucide-react';
import { CAMERA_STATUS } from '../../hooks/useCamera.js';

const BUTTON_BASE =
  'inline-flex items-center justify-center gap-2 rounded-xl px-5 py-2.5 text-sm font-semibold transition focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-blue-600 disabled:cursor-not-allowed disabled:opacity-50';

export default function CameraControls({ status, onStart, onStop }) {
  const isStarting = status === CAMERA_STATUS.STARTING;
  const isLive = status === CAMERA_STATUS.LIVE;

  return (
    <div className="flex flex-wrap gap-3">
      <button
        type="button"
        onClick={onStart}
        disabled={isLive || isStarting}
        className={`${BUTTON_BASE} bg-gradient-to-r from-blue-600 to-violet-600 text-white shadow-md shadow-blue-600/20 hover:-translate-y-0.5 hover:shadow-lg`}
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
        className={`${BUTTON_BASE} bg-white text-slate-800 shadow-sm ring-1 ring-slate-200 hover:bg-slate-50`}
      >
        <Square size={16} aria-hidden="true" />
        Stop Camera
      </button>
    </div>
  );
}
