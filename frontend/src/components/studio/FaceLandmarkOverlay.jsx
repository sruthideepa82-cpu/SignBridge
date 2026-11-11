import { useEffect, useRef } from 'react';
import { drawFaceOverlay } from '../../lib/faceOverlay.js';

// Draws the face contour, eyes, eyebrows, nose and lips over the webcam image. The canvas covers the same box as
// the image and is mirrored with the same CSS transform, so landmark points line up with the face on screen.
// Redraws when the face result changes and when the preview is resized.
export default function FaceLandmarkOverlay({ points }) {
  const canvasRef = useRef(null);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return undefined;

    const draw = () => {
      const width = canvas.clientWidth;
      const height = canvas.clientHeight;
      const dpr = window.devicePixelRatio || 1;
      if (canvas.width !== Math.round(width * dpr) || canvas.height !== Math.round(height * dpr)) {
        canvas.width = Math.round(width * dpr);
        canvas.height = Math.round(height * dpr);
      }
      const ctx = canvas.getContext('2d');
      if (!ctx) return;
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      drawFaceOverlay(ctx, points, width, height);
    };

    draw();
    if (typeof ResizeObserver === 'undefined') return undefined;
    const observer = new ResizeObserver(draw);
    observer.observe(canvas);
    return () => observer.disconnect();
  }, [points]);

  return (
    <canvas
      ref={canvasRef}
      aria-hidden="true"
      data-testid="face-landmark-overlay"
      className="pointer-events-none absolute inset-0 h-full w-full -scale-x-100"
    />
  );
}
