import type { NormalizedLandmark } from '@mediapipe/tasks-vision';
import { CONFIDENCE_THRESHOLD, FINISH_SIGN, ONE_HAND_SIGNS, type SignDefinition } from '../app/signs';
import { extractFeatures, patternScore, type HandFeatures } from './features';

export interface SignPrediction {
  word: string;
  confidence: number;
}

export type Hands = NormalizedLandmark[][];

// The rest of the app depends only on this interface. A trained model can implement it instead.
export interface SignClassifier {
  classify(hands: Hands): SignPrediction | null;
}

function bestOneHand(features: HandFeatures): SignPrediction {
  let best: SignPrediction = { word: '', confidence: 0 };
  for (const sign of ONE_HAND_SIGNS) {
    const confidence = patternScore(features.extension, sign.pattern);
    if (confidence > best.confidence) {
      best = { word: sign.word, confidence };
    }
  }
  return best;
}

function scoreTwoHands(hands: Hands, sign: SignDefinition): number {
  const features = hands.map((landmarks) => extractFeatures(landmarks));
  const palms = features.map((f) => patternScore(f.extension, sign.pattern));
  const limit = sign.maxWristY ?? 1;
  const wristsHigh = features.every((f) => f.wristY <= limit);
  return Math.min(...palms) * (wristsHigh ? 1 : 0.5);
}

export function classifySign(landmarks: NormalizedLandmark[]): SignPrediction {
  return bestOneHand(extractFeatures(landmarks));
}

export function classifyFinish(hands: Hands): SignPrediction | null {
  if (hands.length !== 2) return null;
  return { word: FINISH_SIGN.word, confidence: scoreTwoHands(hands, FINISH_SIGN) };
}

export const ruleBasedClassifier: SignClassifier = {
  classify(hands) {
    if (hands.length === 0) return null;

    if (hands.length === 2) {
      const finish = classifyFinish(hands);
      if (finish && finish.confidence >= CONFIDENCE_THRESHOLD) return finish;
    }

    // One hand, or two hands that are not a FINISH: use the stronger single-hand reading.
    let best: SignPrediction | null = null;
    for (const landmarks of hands) {
      const candidate = classifySign(landmarks);
      if (!best || candidate.confidence > best.confidence) best = candidate;
    }
    return best;
  },
};
