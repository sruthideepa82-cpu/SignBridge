import type { TrackedHand } from '../vision/handTracker';
import type { SignPrediction } from './classifier';
import { predictWindow, type FetchLike, type PredictResponse } from './modelClient';
import { LandmarkWindow } from './landmarkWindow';

export type SourceStatus = 'waiting' | 'no_model' | 'ready' | 'unavailable';

export interface SourceView {
  status: SourceStatus;
  // The top word with its probability. Null when there is no fresh answer from the model.
  prediction: SignPrediction | null;
  detail: string | null;
}

export interface ModelSignSourceOptions {
  fetch?: FetchLike;
  intervalMs?: number;
  staleAfterMs?: number;
}

// Keeps a 32-frame window of live landmarks and asks the server for a prediction about four times a
// second. Only one request is in flight at a time.
export class ModelSignSource {
  private readonly window = new LandmarkWindow();
  private readonly fetchImpl: FetchLike | undefined;
  private readonly intervalMs: number;
  private readonly staleAfterMs: number;
  private inFlight = false;
  private lastRequestAt = -Infinity;
  private lastAnswer: { response: PredictResponse; at: number } | null = null;
  private status: SourceStatus = 'waiting';
  private detail: string | null = null;

  constructor(options: ModelSignSourceOptions = {}) {
    this.fetchImpl = options.fetch;
    this.intervalMs = options.intervalMs ?? 250;
    this.staleAfterMs = options.staleAfterMs ?? 1000;
  }

  push(hands: readonly TrackedHand[], now: number): void {
    this.window.push(hands);
    if (this.window.full && !this.inFlight && now - this.lastRequestAt >= this.intervalMs) {
      this.request(now);
    }
  }

  view(now: number): SourceView {
    const fresh = this.lastAnswer && now - this.lastAnswer.at <= this.staleAfterMs ? this.lastAnswer.response : null;
    const prediction =
      fresh && fresh.top3.length > 0 ? { word: fresh.top3[0].word, confidence: fresh.top3[0].confidence } : null;
    return { status: this.status, prediction, detail: this.detail };
  }

  private request(now: number): void {
    this.inFlight = true;
    this.lastRequestAt = now;
    predictWindow(this.window.payload(), this.fetchImpl)
      .then((response) => {
        // Stamped with the request time, so staleness follows the frames the answer was made from.
        this.lastAnswer = { response, at: now };
        if (response.status === 'no_model') {
          this.status = 'no_model';
          this.detail = response.detail;
        } else {
          this.status = 'ready';
          this.detail = null;
        }
      })
      .catch((error: unknown) => {
        this.lastAnswer = null;
        this.status = 'unavailable';
        this.detail = error instanceof Error ? error.message : 'The recognizer could not be reached.';
      })
      .finally(() => {
        this.inFlight = false;
      });
  }
}
