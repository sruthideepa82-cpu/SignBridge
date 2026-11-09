import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { EMOTIONS, type Emotion } from '../recognition/emotion';

export interface FaceBox {
  xmin: number;
  ymin: number;
  xmax: number;
  ymax: number;
}

export const EMOTION_COLORS: Record<Emotion, string> = {
  Happy: '#ffd54a',
  Sad: '#5aa9ff',
  Neutral: '#b8b8c2',
  Angry: '#ff4d4d',
  Questioning: '#b57bff',
  Skeptical: '#ff9a3d',
};

export function faceBox(landmarks: NormalizedLandmark[]): FaceBox {
  let xmin = 1;
  let ymin = 1;
  let xmax = 0;
  let ymax = 0;
  for (const point of landmarks) {
    xmin = Math.min(xmin, point.x);
    ymin = Math.min(ymin, point.y);
    xmax = Math.max(xmax, point.x);
    ymax = Math.max(ymax, point.y);
  }
  return { xmin, ymin, xmax, ymax };
}

// Canvas drawing uses the same mirrored coordinate space as the video, so raw landmark values are used.
export function drawFaceMesh(ctx: CanvasRenderingContext2D, landmarks: NormalizedLandmark[], width: number, height: number): void {
  ctx.save();
  ctx.fillStyle = 'rgba(255, 255, 255, 0.35)';
  for (const point of landmarks) {
    ctx.fillRect(point.x * width, point.y * height, 1.2, 1.2);
  }
  ctx.restore();
}

export function drawFaceBox(ctx: CanvasRenderingContext2D, box: FaceBox, width: number, height: number): void {
  ctx.save();
  ctx.strokeStyle = 'rgba(255, 255, 255, 0.92)';
  ctx.lineWidth = 1.5;
  ctx.strokeRect(box.xmin * width, box.ymin * height, (box.xmax - box.xmin) * width, (box.ymax - box.ymin) * height);
  ctx.restore();
}

// The video is mirrored with CSS, so the box's top-right corner on screen is at (1 - xmin, ymin).
export function positionEmotionTag(tag: HTMLElement, box: FaceBox, emotion: Emotion): void {
  tag.style.left = `${(1 - box.xmin) * 100}%`;
  tag.style.top = `${box.ymin * 100}%`;
  tag.textContent = emotion;
  tag.style.color = EMOTION_COLORS[emotion];
  tag.style.borderColor = EMOTION_COLORS[emotion];
  tag.hidden = false;
}

export function renderEmotionLegend(legend: HTMLElement, active: Emotion | null): void {
  for (const emotion of EMOTIONS) {
    const item = legend.querySelector<HTMLElement>(`[data-emotion="${emotion}"]`);
    if (!item) continue;
    const isActive = emotion === active;
    item.classList.toggle('is-active', isActive);
    item.setAttribute('aria-current', isActive ? 'true' : 'false');
    item.style.setProperty('--emotion-color', EMOTION_COLORS[emotion]);
  }
}
