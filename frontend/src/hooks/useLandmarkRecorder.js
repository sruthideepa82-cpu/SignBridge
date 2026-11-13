import { useCallback, useEffect, useRef, useState } from 'react';
import { appendFrame } from '../lib/datasetRecording.js';
import { getHandLandmarks } from '../services/cameraService.js';

// Faster than the Live Studio poll, so a clip keeps most of the processed frames. Duplicates are dropped by
// frame sequence, so polling faster than the camera never records a frame twice.
export const CAPTURE_INTERVAL_MS = 50;

// Records processed frames from the existing backend landmark pipeline while `recording` is true.
export default function useLandmarkRecorder({ enabled }) {
  const [recording, setRecording] = useState(false);
  const [frameCount, setFrameCount] = useState(0);
  const [elapsedMs, setElapsedMs] = useState(0);
  const framesRef = useRef([]);
  const lastSequenceRef = useRef(-1);
  const startedAtRef = useRef(0);

  useEffect(() => {
    if (!recording || !enabled) return undefined;
    let cancelled = false;
    let inFlight = false;

    const poll = async () => {
      if (inFlight) return;
      inFlight = true;
      try {
        const snapshot = await getHandLandmarks();
        if (cancelled || !snapshot.running) return;
        const tMs = Date.now() - startedAtRef.current;
        const next = appendFrame(framesRef.current, lastSequenceRef.current, snapshot, tMs);
        if (next.frames !== framesRef.current) {
          framesRef.current = next.frames;
          lastSequenceRef.current = next.lastSequence;
          setFrameCount(next.frames.length);
        }
      } catch {
        // A failed poll is skipped. The clip keeps the frames it already has.
      } finally {
        inFlight = false;
      }
    };

    const timer = setInterval(poll, CAPTURE_INTERVAL_MS);
    const tick = setInterval(() => setElapsedMs(Date.now() - startedAtRef.current), 100);
    poll();
    return () => {
      cancelled = true;
      clearInterval(timer);
      clearInterval(tick);
    };
  }, [recording, enabled]);

  const start = useCallback(() => {
    framesRef.current = [];
    lastSequenceRef.current = -1;
    startedAtRef.current = Date.now();
    setFrameCount(0);
    setElapsedMs(0);
    setRecording(true);
  }, []);

  // Stops and returns the captured frames with the time they took.
  const stop = useCallback(() => {
    setRecording(false);
    const durationMs = Date.now() - startedAtRef.current;
    setElapsedMs(durationMs);
    return { frames: framesRef.current, durationMs };
  }, []);

  const discard = useCallback(() => {
    framesRef.current = [];
    setFrameCount(0);
    setElapsedMs(0);
  }, []);

  return { recording, frameCount, elapsedMs, start, stop, discard };
}
