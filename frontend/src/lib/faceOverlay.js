import { FACE_OVAL, LEFT_EYE, RIGHT_EYE, LEFT_EYEBROW, RIGHT_EYEBROW, NOSE, LIPS } from './faceConnections.js';

// Face contour, eyes, eyebrows, nose and lips. The full tesselation (about 2,500 lines) is left out on purpose,
// so the overlay stays readable on top of the video.
export const FACE_OVERLAY_CONNECTIONS = [FACE_OVAL, LEFT_EYE, RIGHT_EYE, LEFT_EYEBROW, RIGHT_EYEBROW, NOSE, LIPS];

export const FACE_OVERLAY_STYLE = {
  color: 'rgba(245, 243, 250, 0.7)',
  lineWidth: 1,
};

// Points are [x, y] normalised to the frame. Returns pixel segments [x1, y1, x2, y2] for the given size.
export function faceOverlaySegments(points, connections, width, height) {
  if (!Array.isArray(points) || points.length === 0) return [];
  const segments = [];
  for (const set of connections) {
    for (const [start, end] of set) {
      const a = points[start];
      const b = points[end];
      if (!a || !b) continue;
      segments.push([a[0] * width, a[1] * height, b[0] * width, b[1] * height]);
    }
  }
  return segments;
}

// Where a frame of the given aspect ratio sits inside a box when it is shown with object-fit: cover.
// Returns the drawn size and the offset of the frame's top-left corner, both in box pixels.
export function coverFrame(boxWidth, boxHeight, frameAspect) {
  const scale = Math.max(boxWidth / frameAspect, boxHeight);
  const drawWidth = frameAspect * scale;
  const drawHeight = scale;
  return {
    drawWidth,
    drawHeight,
    offsetX: (boxWidth - drawWidth) / 2,
    offsetY: (boxHeight - drawHeight) / 2,
  };
}

export function drawFaceOverlay(ctx, points, width, height, frameAspect = null) {
  ctx.clearRect(0, 0, width, height);
  const frame = frameAspect ? coverFrame(width, height, frameAspect) : { drawWidth: width, drawHeight: height, offsetX: 0, offsetY: 0 };
  const segments = faceOverlaySegments(points, FACE_OVERLAY_CONNECTIONS, frame.drawWidth, frame.drawHeight).map(([x1, y1, x2, y2]) => [
    x1 + frame.offsetX,
    y1 + frame.offsetY,
    x2 + frame.offsetX,
    y2 + frame.offsetY,
  ]);
  if (segments.length === 0) return 0;
  ctx.save();
  ctx.strokeStyle = FACE_OVERLAY_STYLE.color;
  ctx.lineWidth = FACE_OVERLAY_STYLE.lineWidth;
  ctx.lineCap = 'round';
  ctx.beginPath();
  for (const [x1, y1, x2, y2] of segments) {
    ctx.moveTo(x1, y1);
    ctx.lineTo(x2, y2);
  }
  ctx.stroke();
  ctx.restore();
  return segments.length;
}
