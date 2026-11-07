import { CameraOff, LoaderCircle, TriangleAlert } from 'lucide-react';
import { CAMERA_STATUS } from '../../hooks/useCamera.js';

function PreviewPlaceholder({ status, errorMessage }) {
  if (status === CAMERA_STATUS.STARTING) {
    return (
      <PlaceholderContent
        icon={<LoaderCircle size={36} className="animate-spin text-blue-400" aria-hidden="true" />}
        title="Connecting to webcam…"
        description="The backend is opening the camera with OpenCV."
      />
    );
  }

  if (status === CAMERA_STATUS.ERROR) {
    return (
      <PlaceholderContent
        icon={<TriangleAlert size={36} className="text-amber-400" aria-hidden="true" />}
        title="Camera unavailable"
        description={errorMessage}
        role="alert"
      />
    );
  }

  return (
    <PlaceholderContent
      icon={<CameraOff size={36} className="text-slate-400" aria-hidden="true" />}
      title="Camera is off"
      description='Press "Start Camera" to preview your webcam. The preview is for setup only.'
    />
  );
}

function PlaceholderContent({ icon, title, description, role }) {
  return (
    <div className="flex h-full flex-col items-center justify-center px-6 text-center" role={role}>
      <span className="flex h-16 w-16 items-center justify-center rounded-2xl bg-white/5 ring-1 ring-white/10">
        {icon}
      </span>
      <p className="mt-4 text-base font-semibold text-white">{title}</p>
      <p className="mt-2 max-w-sm text-sm leading-relaxed text-slate-400">{description}</p>
    </div>
  );
}

export default function CameraPreview({ status, streamUrl, errorMessage, onStreamError }) {
  const isLive = status === CAMERA_STATUS.LIVE && Boolean(streamUrl);

  return (
    <div
      className="relative aspect-video w-full overflow-hidden rounded-2xl bg-slate-900 ring-1 ring-slate-900/10"
      aria-label="Camera preview"
    >
      {isLive ? (
        <>
          <img
            src={streamUrl}
            alt="Live webcam feed"
            className="h-full w-full object-cover -scale-x-100"
            onError={onStreamError}
          />
          <span className="absolute left-3 top-3 inline-flex items-center gap-2 rounded-full bg-black/60 px-2.5 py-1 text-xs font-semibold text-white backdrop-blur">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-red-500 opacity-75" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-red-500" />
            </span>
            LIVE
          </span>
        </>
      ) : (
        <div className="absolute inset-0 bg-gradient-to-br from-slate-800 via-slate-900 to-slate-900">
          <PreviewPlaceholder status={status} errorMessage={errorMessage} />
        </div>
      )}
    </div>
  );
}
