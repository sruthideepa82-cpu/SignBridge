import { FilesetResolver, HandLandmarker, type NormalizedLandmark } from '@mediapipe/tasks-vision';

export interface TrackedHand {
  landmarks: NormalizedLandmark[];
  handedness: string;
  score: number;
}

export interface HandFrame {
  hands: TrackedHand[];
}

export interface HandTracker {
  detect(video: HTMLVideoElement, timestampMs: number): HandFrame;
  close(): void;
}

async function createLandmarker(delegate: 'GPU' | 'CPU'): Promise<HandLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks('/wasm');
  return HandLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: '/models/hand_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numHands: 2,
    minHandDetectionConfidence: 0.5,
    minHandPresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export async function createHandTracker(): Promise<HandTracker> {
  let landmarker: HandLandmarker;
  try {
    landmarker = await createLandmarker('GPU');
  } catch {
    landmarker = await createLandmarker('CPU');
  }

  return {
    detect(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      const hands = result.landmarks.map((landmarks, index) => {
        const category = result.handedness[index]?.[0];
        return {
          landmarks,
          handedness: category?.categoryName ?? 'Unknown',
          score: category?.score ?? 0,
        };
      });
      return { hands };
    },
    close() {
      landmarker.close();
    },
  };
}
