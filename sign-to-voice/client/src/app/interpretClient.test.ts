import { describe, expect, it } from 'vitest';
import { fallbackSentence, interpretGlosses, type FetchLike } from './interpretClient';

const GLOSSES = ['TECHNOLOGY', 'USE', 'IMPROVE', 'LIFE', 'WAR', 'NOT'];

function jsonResponse(body: unknown, status = 200): Response {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json' } });
}

describe('interpretGlosses', () => {
  it('posts the glosses and emotion and returns the sentence', async () => {
    let sent: { url: string; body: unknown } | null = null;
    const fetchImpl: FetchLike = async (url, init) => {
      sent = { url, body: JSON.parse(String(init?.body)) };
      return jsonResponse({ sentence: "Let's use technology to improve lives, not war." });
    };

    const result = await interpretGlosses(GLOSSES, 'Angry', fetchImpl);

    expect(sent).toEqual({ url: '/api/interpret', body: { glosses: GLOSSES, emotion: 'Angry' } });
    expect(result).toEqual({
      sentence: "Let's use technology to improve lives, not war.",
      usedFallback: false,
      reason: null,
    });
  });

  it('falls back to the joined gloss string when the server reports an error', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ detail: { message: 'The model did not answer.' } }, 502);

    const result = await interpretGlosses(GLOSSES, 'Neutral', fetchImpl);

    expect(result.usedFallback).toBe(true);
    expect(result.sentence).toBe('TECHNOLOGY USE IMPROVE LIFE WAR NOT');
    expect(result.reason).toBe('The model did not answer.');
  });

  it('falls back when the server cannot be reached', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new TypeError('Failed to fetch');
    };

    const result = await interpretGlosses(['LIFE'], 'Sad', fetchImpl);

    expect(result.usedFallback).toBe(true);
    expect(result.sentence).toBe('LIFE');
    expect(result.reason).toBe('The interpretation server could not be reached.');
  });

  it('falls back when the server returns an empty sentence', async () => {
    const fetchImpl: FetchLike = async () => jsonResponse({ sentence: '   ' });

    const result = await interpretGlosses(['LIFE'], 'Sad', fetchImpl);

    expect(result.usedFallback).toBe(true);
  });

  it('reports a timeout distinctly', async () => {
    const fetchImpl: FetchLike = async () => {
      throw new DOMException('aborted', 'AbortError');
    };

    const result = await interpretGlosses(['LIFE'], 'Sad', fetchImpl);

    expect(result.reason).toBe('The interpretation server did not respond in time.');
  });
});

describe('fallbackSentence', () => {
  it('joins glosses with spaces in signing order', () => {
    expect(fallbackSentence(['USE', 'LIFE'])).toBe('USE LIFE');
  });
});
