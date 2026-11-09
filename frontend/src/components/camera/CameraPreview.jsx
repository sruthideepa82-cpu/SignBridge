import { CameraOff, LoaderCircle, TriangleAlert } from 'lucide-react';
import { CAMERA_STATUS } from '../../hooks/useCamera.js';

function PreviewPlaceholder({ status, errorMessage }) {
  if (status === CAMERA_STATUS.STARTING) {
    return (
      <PlaceholderContent
        icon={<LoaderCircle size={36} className="animate-spin text-lime-signal" aria-hidden="true" />}
        title="Connecting to webcam…"
        description="The backend is opening the camera with OpenCV."
      />
    );
  }

  if (status === CAMERA_STATUS.ERROR) {
    return (
      <PlaceholderContent
        icon={<TriangleAlert size={36} className="text-amber-300" aria-hidden="true" />}
        title="Camera unavailable"
        description={errorMessage}
        role="alert"
      />
    );
  }

  return (
    <PlaceholderContent
      icon={<CameraOff size={36} className="text-zinc-500" aria-hidden="true" />}
      title="Camera is off"
      description='Press "Start Camera" to preview your webcam. The preview is for setup only.'
    />
  );
}

function PlaceholderContent({ icon, title, description, role }) {
  return (
    <div className="flex h-full animate-fade-up flex-col items-center justify-center px-6 text-center" role={role}>
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/[0.04] ring-1 ring-white/10">
        {icon}
      </span>
      <p className="mt-4 text-base font-semibold text-zinc-100">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-zinc-500">{description}</p>
    </div>
  );
}

export default function CameraPreview({ status, streamUrl, errorMessage, onStreamError }) {
  const isLive = status === CAMERA_STATUS.LIVE && Boolean(streamUrl);

  return (
    <div
      className={`relative aspect-video w-full overflow-hidden rounded-md border bg-black transition-all duration-700 ${
        isLive ? 'border-lime-signal/40 shadow-[0_0_60px_-24px_rgba(182,255,0,0.5)]' : 'border-white/10'
      }`}
      aria-label="Camera preview"
    >
      {isLive ? (
        <>
          <img
            src={streamUrl}
            alt="Live webcam feed"
            className="h-full w-full animate-fade-up object-cover -scale-x-100"
            onError={onStreamError}
          />
          <span
            aria-hidden="true"
            className="pointer-events-none absolute inset-x-0 top-0 h-1/4 animate-scan-line bg-gradient-to-b from-transparent via-lime-signal/10 to-transparent"
          />
          <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold tracking-wide text-white ring-1 ring-white/10 backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            LIVE
          </span>
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-zinc-900 via-black to-zinc-950">
          <PreviewPlaceholder status={status} errorMessage={errorMessage} />
        </div>
      )}
    </div>
  );
}
