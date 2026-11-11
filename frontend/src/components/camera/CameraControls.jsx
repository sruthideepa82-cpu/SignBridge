import { LoaderCircle, Pause, Play, Settings, Square, Video, VideoOff } from 'lucide-react';
import { Link } from 'react-router-dom';
import { CAMERA_STATUS } from '../../hooks/useCamera.js';

const BUTTON =
  'inline-flex h-9 items-center justify-center gap-2 rounded-lg px-3.5 text-sm font-medium transition-colors duration-150 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-accent disabled:cursor-not-allowed disabled:opacity-40';

// Camera toggle, Pause/Resume recognition, Stop session and Settings.
// Pause keeps the camera running. Stop session turns the camera off and discards the unsent sign draft.
export default function CameraControls({ status, onStart, onStop, paused = false, onTogglePause, onStopSession, canStopSession }) {
  const isStarting = status === CAMERA_STATUS.STARTING;
  const isLive = status === CAMERA_STATUS.LIVE;

  return (
    <div className="flex flex-wrap items-center gap-2" role="toolbar" aria-label="Camera controls">
      {isLive ? (
        <button type="button" onClick={onStop} className={`${BUTTON} border border-app-border bg-app-surface text-app-text hover:bg-app-raised`}>
          <VideoOff size={16} aria-hidden="true" />
          Stop Camera
        </button>
      ) : (
        <button type="button" onClick={onStart} disabled={isStarting} className={`${BUTTON} bg-accent text-app-bg hover:bg-accent-hover`}>
          {isStarting ? <LoaderCircle size={16} className="animate-spin" aria-hidden="true" /> : <Video size={16} aria-hidden="true" />}
          {isStarting ? 'Starting…' : 'Start Camera'}
        </button>
      )}

      <button
        type="button"
        onClick={onTogglePause}
        disabled={!isLive}
        aria-pressed={paused}
        className={`${BUTTON} border border-app-border bg-app-surface text-app-text hover:bg-app-raised`}
      >
        {paused ? <Play size={16} aria-hidden="true" /> : <Pause size={16} aria-hidden="true" />}
        {paused ? 'Resume recognition' : 'Pause recognition'}
      </button>

      <button
        type="button"
        onClick={onStopSession}
        disabled={!canStopSession}
        className={`${BUTTON} text-danger hover:bg-danger/10`}
      >
        <Square size={14} fill="currentColor" aria-hidden="true" />
        Stop session
      </button>

      <Link
        to="/settings"
        aria-label="Camera and display settings"
        title="Settings"
        className="ml-auto flex h-9 w-9 items-center justify-center rounded-lg text-app-muted transition-colors hover:bg-white/[0.06] hover:text-app-text focus-visible:outline-2 focus-visible:outline-accent"
      >
        <Settings size={17} aria-hidden="true" />
      </Link>
    </div>
  );
}
