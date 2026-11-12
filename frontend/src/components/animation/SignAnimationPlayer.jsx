import { Film, Pause, Play, RotateCcw, VideoOff } from 'lucide-react';
import { useEffect, useRef, useState } from 'react';
import { buttonClass } from '../app/ui.jsx';

export const PLAYBACK_SPEEDS = [0.5, 0.75, 1, 1.25];

// Reusable clip player. It knows nothing about signs, so Learn Signs and Text-to-Sign can share it.
// `available` is null while the clip is being checked, true when it exists, and false when it does not.
export default function SignAnimationPlayer({ src, label, available = true, autoPlay = false, onPlay, className = '' }) {
  const videoRef = useRef(null);
  const [speed, setSpeed] = useState(1);
  const [playing, setPlaying] = useState(false);
  const [broken, setBroken] = useState(false);
  const ready = available === true && !broken;

  useEffect(() => {
    setBroken(false);
    setPlaying(false);
  }, [src]);

  const start = () => {
    const video = videoRef.current;
    if (!video) return;
    const result = video.play();
    result?.catch?.(() => setPlaying(false));
  };

  useEffect(() => {
    if (autoPlay && ready) start();
  }, [autoPlay, ready, src]);

  const toggle = () => {
    const video = videoRef.current;
    if (!video) return;
    if (video.ended) video.currentTime = 0;
    if (video.paused) start();
    else video.pause();
  };

  const replay = () => {
    const video = videoRef.current;
    if (!video) return;
    video.currentTime = 0;
    start();
  };

  const changeSpeed = (value) => {
    setSpeed(value);
    if (videoRef.current) videoRef.current.playbackRate = value;
  };

  return (
    <div className={`overflow-hidden rounded-xl border border-app-border bg-app-bg ${className}`}>
      <div className="relative flex aspect-video w-full items-center justify-center">
        {ready ? (
          <video
            key={src}
            ref={videoRef}
            src={src}
            aria-label={`Sign animation: ${label}`}
            muted
            playsInline
            preload="metadata"
            className="h-full w-full object-contain"
            onPlay={() => {
              setPlaying(true);
              onPlay?.();
            }}
            onPause={() => setPlaying(false)}
            onEnded={() => setPlaying(false)}
            onLoadedMetadata={(event) => {
              event.currentTarget.playbackRate = speed;
            }}
            onError={() => setBroken(true)}
          />
        ) : (
          <AnimationPlaceholder label={label} checking={available === null} />
        )}
      </div>

      {ready && (
        <div className="flex items-center gap-2 border-t border-app-border p-3">
          <button
            type="button"
            onClick={toggle}
            aria-label={playing ? `Pause ${label} animation` : `Play ${label} animation`}
            className={buttonClass('primary', 'w-9 px-0')}
          >
            {playing ? <Pause size={16} aria-hidden="true" /> : <Play size={16} aria-hidden="true" />}
          </button>
          <button
            type="button"
            onClick={replay}
            aria-label={`Replay ${label} animation`}
            className={buttonClass('secondary', 'w-9 px-0')}
          >
            <RotateCcw size={15} aria-hidden="true" />
          </button>
          <label className="ml-auto flex items-center gap-2 text-xs text-app-muted">
            <span>Speed</span>
            <select
              value={speed}
              onChange={(event) => changeSpeed(Number(event.target.value))}
              className="h-9 rounded-lg border border-app-border bg-app-surface px-2 text-sm text-app-text focus-visible:outline-2 focus-visible:outline-accent"
            >
              {PLAYBACK_SPEEDS.map((value) => (
                <option key={value} value={value}>
                  {value}×
                </option>
              ))}
            </select>
          </label>
        </div>
      )}
    </div>
  );
}

export function AnimationPlaceholder({ label, checking = false }) {
  const Icon = checking ? Film : VideoOff;
  return (
    <div role="status" className="flex max-w-xs flex-col items-center px-6 text-center">
      <span className="flex h-11 w-11 items-center justify-center rounded-xl border border-app-border text-app-muted">
        <Icon size={20} aria-hidden="true" />
      </span>
      <p className="mt-3 text-sm font-medium text-app-text">
        {checking ? 'Checking for animation…' : 'Animation not available yet'}
      </p>
      {!checking && (
        <p className="mt-1 text-xs leading-relaxed text-app-muted">
          No clip has been added for {label}, so nothing is shown. Use the reference chart in the meantime.
        </p>
      )}
    </div>
  );
}
