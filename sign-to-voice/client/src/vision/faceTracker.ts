import { FaceLandmarker, FilesetResolver, type NormalizedLandmark } from '@mediapipe/tasks-vision';
import type { Blendshapes } from '../recognition/emotion';

export interface FaceFrame {
  landmarks: NormalizedLandmark[];
  blendshapes: Blendshapes;
}

export interface FaceTracker {
  detect(video: HTMLVideoElement, timestampMs: number): FaceFrame | null;
  close(): void;
}

async function createLandmarker(delegate: 'GPU' | 'CPU'): Promise<FaceLandmarker> {
  const fileset = await FilesetResolver.forVisionTasks('/wasm');
  return FaceLandmarker.createFromOptions(fileset, {
    baseOptions: { modelAssetPath: '/models/face_landmarker.task', delegate },
    runningMode: 'VIDEO',
    numFaces: 1,
    outputFaceBlendshapes: true,
    minFaceDetectionConfidence: 0.5,
    minFacePresenceConfidence: 0.5,
    minTrackingConfidence: 0.5,
  });
}

export async function createFaceTracker(): Promise<FaceTracker> {
  let landmarker: FaceLandmarker;
  try {
    landmarker = await createLandmarker('GPU');
  } catch {
    landmarker = await createLandmarker('CPU');
  }

  return {
    detect(video, timestampMs) {
      const result = landmarker.detectForVideo(video, timestampMs);
      const landmarks = result.faceLandmarks[0];
      const categories = result.faceBlendshapes?.[0]?.categories;
      if (!landmarks || !categories) return null;

      const blendshapes: Record<string, number> = {};
      for (const category of categories) {
        blendshapes[category.categoryName] = category.score;
      }
      return { landmarks, blendshapes };
    },
    close() {
      landmarker.close();
    },
  };
}
