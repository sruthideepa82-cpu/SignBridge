// Sends a landmark window to the server. The browser never sees the model file.

export interface TopItem {
  word: string;
  confidence: number;
}

export interface PredictResponse {
  status: 'recognized' | 'uncertain' | 'no_model';
  word: string | null;
  confidence: number;
  top3: TopItem[];
  threshold: number;
  detail: string | null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 3000;

export async function predictWindow(
  landmarks: number[][][][],
  fetchImpl: FetchLike = fetch,
): Promise<PredictResponse> {
  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);
  try {
    const response = await fetchImpl('/api/predict', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ landmarks }),
      signal: controller.signal,
    });
    if (!response.ok) throw new Error(`The recognizer returned ${response.status}.`);
    return (await response.json()) as PredictResponse;
  } finally {
    clearTimeout(timer);
  }
}
