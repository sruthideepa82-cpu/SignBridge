import type { NormalizedLandmark } from '@mediapipe/tasks-vision';

// Index pairs for the 21-joint hand skeleton (MediaPipe hand topology).
export const HAND_CONNECTIONS: ReadonlyArray<readonly [number, number]> = [
  [0, 1], [1, 2], [2, 3], [3, 4],
  [0, 5], [5, 6], [6, 7], [7, 8],
  [5, 9], [9, 10], [10, 11], [11, 12],
  [9, 13], [13, 14], [14, 15], [15, 16],
  [13, 17], [17, 18], [18, 19], [19, 20],
  [0, 17],
];

export const SKELETON_COLOR = '#ff5c7a';

// Draws in the canvas' own coordinate space. The canvas is mirrored by CSS together with the video,
// so landmark x values are used as-is.
export function drawHandSkeleton(
  ctx: CanvasRenderingContext2D,
  landmarks: NormalizedLandmark[],
  width: number,
  height: number,
): void {
  const points = landmarks.map((p) => ({ x: p.x * width, y: p.y * height }));

  ctx.save();
  ctx.lineCap = 'round';
  ctx.shadowColor = SKELETON_COLOR;
  ctx.shadowBlur = 12;
  ctx.strokeStyle = SKELETON_COLOR;
  ctx.lineWidth = 3;
  ctx.beginPath();
  for (const [a, b] of HAND_CONNECTIONS) {
    ctx.moveTo(points[a].x, points[a].y);
    ctx.lineTo(points[b].x, points[b].y);
  }
  ctx.stroke();

  ctx.fillStyle = '#ffd1db';
  for (const point of points) {
    ctx.beginPath();
    ctx.arc(point.x, point.y, 4, 0, Math.PI * 2);
    ctx.fill();
  }
  ctx.restore();
}
