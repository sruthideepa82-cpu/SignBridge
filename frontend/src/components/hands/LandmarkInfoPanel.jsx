const formatCoordinate = (value) => value.toFixed(3);

function HandTable({ hand, handNumber }) {
  return (
    <div className="overflow-hidden rounded-2xl ring-1 ring-white/10">
      <div className="flex items-center justify-between gap-3 border-b border-white/10 bg-white/[0.03] px-4 py-2.5">
        <p className="text-sm font-semibold text-zinc-100">
          Hand {handNumber} · {hand.handedness}
        </p>
        <p className="text-xs text-zinc-500">Confidence {Math.round(hand.score * 100)}%</p>
      </div>
      <div className="max-h-72 overflow-y-auto">
        <table className="w-full text-left text-xs">
          <caption className="sr-only">Landmarks for hand {handNumber}</caption>
          <thead className="sticky top-0 bg-zinc-950 text-zinc-500">
            <tr>
              <th scope="col" className="px-3 py-2 font-medium">#</th>
              <th scope="col" className="px-3 py-2 font-medium">Landmark</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">X</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Y</th>
              <th scope="col" className="px-3 py-2 text-right font-medium">Z</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/5 font-mono text-zinc-300">
            {hand.landmarks.map((point) => (
              <tr key={point.index}>
                <td className="px-3 py-1.5">{point.index}</td>
                <td className="px-3 py-1.5 font-sans">{point.name.replaceAll('_', ' ').toLowerCase()}</td>
                <td className="px-3 py-1.5 text-right">{formatCoordinate(point.x)}</td>
                <td className="px-3 py-1.5 text-right">{formatCoordinate(point.y)}</td>
                <td className="px-3 py-1.5 text-right">{formatCoordinate(point.z)}</td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function UnavailableNotice({ title, description }) {
  return (
    <div className="mt-4 rounded-2xl border border-dashed border-white/10 bg-white/[0.02] px-6 py-8 text-center">
      <p className="text-sm font-semibold text-zinc-200">{title}</p>
      <p className="mt-1 text-xs leading-relaxed text-zinc-500">{description}</p>
    </div>
  );
}

export default function LandmarkInfoPanel({ landmarks, cameraLive, error = '' }) {
  const hands = landmarks?.hands ?? [];
  const status = landmarks?.status;

  return (
    <section
      className="rounded-3xl border border-white/[0.07] bg-white/[0.03] p-5 backdrop-blur-xl sm:p-6"
      aria-labelledby="landmark-info-title"
    >
      <h2 id="landmark-info-title" className="text-lg font-semibold tracking-tight text-zinc-100">
        Landmark data
      </h2>

      {!cameraLive && (
        <p className="mt-4 text-sm leading-relaxed text-zinc-500">
          Start the camera to see hand landmark coordinates.
        </p>
      )}

      {cameraLive && error && (
        <UnavailableNotice
          title="Landmark data unavailable"
          description="The backend did not return landmarks. Coordinates are hidden so old values are not shown as current."
        />
      )}

      {cameraLive && !error && !landmarks && (
        <p className="mt-4 text-sm leading-relaxed text-zinc-500">Waiting for the first landmark result.</p>
      )}

      {cameraLive && !error && status === 'detection_unavailable' && (
        <UnavailableNotice
          title="Hand detection unavailable"
          description="The hand model could not be loaded, so no coordinates can be produced. See the status above."
        />
      )}

      {cameraLive && !error && status === 'processing_error' && (
        <UnavailableNotice
          title="Hand detection failed"
          description="The latest frame could not be processed. Coordinates are hidden until detection recovers."
        />
      )}

      {cameraLive && !error && status === 'no_hand' && hands.length === 0 && (
        <UnavailableNotice
          title="No hand detected"
          description="Show one or both hands to the camera. Coordinates appear here when a hand is detected."
        />
      )}

      {cameraLive && !error && status === 'hand_detected' && hands.length > 0 && (
        <div className="mt-4 space-y-4">
          {hands.map((hand, index) => (
            <HandTable key={`${hand.handedness}-${index}`} hand={hand} handNumber={index + 1} />
          ))}
          <p className="text-xs leading-relaxed text-zinc-500">
            X and Y are normalized to the frame (0 to 1, origin at the top-left). Z is relative depth from the wrist.
          </p>
        </div>
      )}
    </section>
  );
}
