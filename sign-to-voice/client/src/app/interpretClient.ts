// Calls the interpretation server. If the call fails for any reason, the caller gets the raw gloss
// order instead of a sentence, and says so.

export interface InterpretResult {
  sentence: string;
  usedFallback: boolean;
  reason: string | null;
}

export type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

const TIMEOUT_MS = 20000;

export function fallbackSentence(glosses: readonly string[]): string {
  return glosses.join(' ');
}

async function errorReason(response: Response): Promise<string> {
  try {
    const body = (await response.json()) as { detail?: { message?: string } };
    if (body.detail?.message) return body.detail.message;
  } catch {
    // Not JSON; fall through to the status code.
  }
  return `The interpretation server returned ${response.status}.`;
}

export async function interpretGlosses(
  glosses: readonly string[],
  emotion: string,
  fetchImpl: FetchLike = fetch,
): Promise<InterpretResult> {
  const fallback = (reason: string): InterpretResult => ({
    sentence: fallbackSentence(glosses),
    usedFallback: true,
    reason,
  });

  const controller = new AbortController();
  const timer = setTimeout(() => controller.abort(), TIMEOUT_MS);

  try {
    const response = await fetchImpl('/api/interpret', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ glosses, emotion }),
      signal: controller.signal,
    });

    if (!response.ok) return fallback(await errorReason(response));

    const body = (await response.json()) as { sentence?: unknown };
    if (typeof body.sentence !== 'string' || body.sentence.trim() === '') {
      return fallback('The interpretation server sent an empty sentence.');
    }
    return { sentence: body.sentence.trim(), usedFallback: false, reason: null };
  } catch (error) {
    const timedOut = error instanceof DOMException && error.name === 'AbortError';
    return fallback(timedOut ? 'The interpretation server did not respond in time.' : 'The interpretation server could not be reached.');
  } finally {
    clearTimeout(timer);
  }
}
