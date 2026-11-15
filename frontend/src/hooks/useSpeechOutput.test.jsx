import { act, renderHook } from '@testing-library/react';
import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest';
import { SPEECH_PREFS_KEY } from '../lib/speechPreferences.js';
import useSpeechOutput from './useSpeechOutput.js';

const message = { id: 'm1', text: 'Hello, how are you?' };

describe('useSpeechOutput', () => {
  let synth;

  beforeEach(() => {
    window.localStorage.clear();
    synth = {
      speak: vi.fn(),
      cancel: vi.fn(),
      pause: vi.fn(),
      resume: vi.fn(),
      getVoices: vi.fn(() => []),
    };
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(text) {
          this.text = text;
        }
      },
    );
  });

  afterEach(() => {
    vi.unstubAllGlobals();
  });

  it('speaks a completed sentence once, however often it is announced', () => {
    const { result } = renderHook(() => useSpeechOutput());

    act(() => {
      result.current.announce(message);
      result.current.announce(message);
    });

    expect(synth.speak).toHaveBeenCalledTimes(1);
  });

  it('speaks again only when the user asks to replay', () => {
    const { result } = renderHook(() => useSpeechOutput());
    act(() => result.current.announce(message));

    act(() => {
      result.current.replay();
    });

    expect(synth.speak).toHaveBeenCalledTimes(2);
  });

  it('does not speak automatically when auto speak is off', () => {
    window.localStorage.setItem(SPEECH_PREFS_KEY, JSON.stringify({ autoSpeak: false }));
    const { result } = renderHook(() => useSpeechOutput());

    act(() => {
      result.current.announce(message);
    });

    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('mutes speech, stops what is playing, and blocks replay until unmuted', () => {
    const { result } = renderHook(() => useSpeechOutput());
    act(() => result.current.announce(message));

    act(() => result.current.toggleMuted());
    expect(synth.cancel).toHaveBeenCalled();
    expect(result.current.prefs.muted).toBe(true);

    act(() => {
      expect(result.current.replay()).toBe(false);
      expect(result.current.announce({ id: 'm2', text: 'Another.' })).toBe(false);
    });
    expect(synth.speak).toHaveBeenCalledTimes(1);

    act(() => result.current.toggleMuted());
    expect(result.current.prefs.muted).toBe(false);
  });

  it('remembers the speech rate and applies it to the next sentence', () => {
    const { result } = renderHook(() => useSpeechOutput());

    act(() => result.current.updatePrefs({ rate: 1.25 }));
    act(() => result.current.announce(message));

    expect(synth.speak.mock.calls[0][0].rate).toBe(1.25);
    expect(JSON.parse(window.localStorage.getItem(SPEECH_PREFS_KEY)).rate).toBe(1.25);
  });

  it('tracks playback state from the utterance events', () => {
    const { result } = renderHook(() => useSpeechOutput());
    act(() => result.current.announce(message));
    expect(result.current.playback).toBe('speaking');

    const utterance = synth.speak.mock.calls[0][0];
    act(() => utterance.onend());
    expect(result.current.playback).toBe('idle');
  });

  it('speaks typed text on request, including text that was already spoken as a sentence', () => {
    const { result } = renderHook(() => useSpeechOutput());
    act(() => result.current.announce(message));

    act(() => {
      expect(result.current.speakText(message.text)).toBe(true);
    });
    expect(synth.speak).toHaveBeenCalledTimes(2);
  });

  it('refuses blank text and blocks speakText while muted', () => {
    const { result } = renderHook(() => useSpeechOutput());

    act(() => {
      expect(result.current.speakText('   ')).toBe(false);
    });
    act(() => result.current.updatePrefs({ muted: true }));
    act(() => {
      expect(result.current.speakText('HELLO')).toBe(false);
    });
    expect(synth.speak).not.toHaveBeenCalled();
  });

  it('ignores the end of an utterance that a newer one has replaced', () => {
    const { result } = renderHook(() => useSpeechOutput());
    act(() => result.current.speakText('FIRST'));
    const first = synth.speak.mock.calls[0][0];
    act(() => result.current.speakText('SECOND'));

    act(() => first.onend());
    expect(result.current.playback).toBe('speaking');
  });

  it('stops speech and resets the state, and pause or resume do nothing without speech', () => {
    const { result } = renderHook(() => useSpeechOutput());

    act(() => result.current.pause());
    expect(synth.pause).not.toHaveBeenCalled();

    act(() => result.current.speakText('HELLO'));
    act(() => result.current.pause());
    expect(result.current.playback).toBe('paused');
    act(() => result.current.resume());
    expect(result.current.playback).toBe('speaking');

    act(() => result.current.stop());
    expect(synth.cancel).toHaveBeenCalled();
    expect(result.current.playback).toBe('idle');
  });

  it('keeps every panel on the same speech settings', () => {
    const first = renderHook(() => useSpeechOutput());
    const second = renderHook(() => useSpeechOutput());

    act(() => second.result.current.updatePrefs({ rate: 0.75 }));

    expect(first.result.current.prefs.rate).toBe(0.75);
    act(() => first.result.current.speakText('HELLO'));
    expect(synth.speak.mock.calls[0][0].rate).toBe(0.75);
  });

  it('resets a panel that was speaking when another panel starts speech', () => {
    const first = renderHook(() => useSpeechOutput());
    const second = renderHook(() => useSpeechOutput());
    act(() => first.result.current.speakText('FIRST'));
    expect(first.result.current.playback).toBe('speaking');

    act(() => second.result.current.speakText('SECOND'));

    expect(first.result.current.playback).toBe('idle');
    expect(second.result.current.playback).toBe('speaking');
  });

  it('reports an unexpected speech failure but not an interruption', () => {
    const { result } = renderHook(() => useSpeechOutput());
    act(() => result.current.speakText('HELLO'));
    const utterance = synth.speak.mock.calls[0][0];

    act(() => utterance.onerror({ error: 'canceled' }));
    expect(result.current.error).toBe('');

    act(() => result.current.speakText('HELLO'));
    act(() => synth.speak.mock.calls[1][0].onerror({ error: 'network' }));
    expect(result.current.error).toBe('Speech stopped unexpectedly. Try again.');
  });
});

// A fake engine with the flags a real browser exposes, so the hook's recovery can be exercised.
describe('useSpeechOutput recovery from a stuck engine', () => {
  let synth;

  beforeEach(() => {
    vi.useFakeTimers();
    window.localStorage.clear();
    synth = {
      speaking: false,
      pending: false,
      paused: false,
      speak: vi.fn(),
      cancel: vi.fn(() => {
        synth.speaking = false;
        synth.pending = false;
      }),
      pause: vi.fn(() => {
        synth.paused = true;
      }),
      resume: vi.fn(() => {
        synth.paused = false;
      }),
      getVoices: vi.fn(() => []),
    };
    vi.stubGlobal('speechSynthesis', synth);
    vi.stubGlobal(
      'SpeechSynthesisUtterance',
      class {
        constructor(text) {
          this.text = text;
        }
      },
    );
  });

  afterEach(() => {
    vi.useRealTimers();
    vi.unstubAllGlobals();
  });

  const advance = (ms) => act(() => vi.advanceTimersByTime(ms));

  it('returns to idle when the engine finishes but never sends an end event', () => {
    const { result } = renderHook(() => useSpeechOutput());
    act(() => result.current.speakText('CAT'));
    const utterance = synth.speak.mock.calls[0][0];
    synth.speaking = true;
    act(() => utterance.onstart());

    synth.speaking = false;
    advance(300);

    expect(result.current.playback).toBe('idle');
    expect(result.current.speakText('CAT')).toBe(true);
  });

  it('retries a dropped utterance once, then reports that speech did not start', () => {
    const { result } = renderHook(() => useSpeechOutput());
    act(() => result.current.speakText('CAT'));
    const utterance = synth.speak.mock.calls[0][0];

    advance(2000);
    expect(synth.speak).toHaveBeenCalledTimes(2);
    expect(synth.speak.mock.calls[1][0]).toBe(utterance);
    expect(result.current.playback).toBe('speaking');

    advance(2000);
    expect(result.current.playback).toBe('idle');
    expect(result.current.error).toBe('Speech did not start. Try again.');
  });

  it('stops an engine that stays "speaking" far beyond the length of the text', () => {
    const { result } = renderHook(() => useSpeechOutput());
    act(() => result.current.speakText('CAT'));
    synth.speaking = true;

    advance(7000);

    expect(synth.cancel).toHaveBeenCalled();
    expect(result.current.playback).toBe('idle');
    expect(result.current.error).toBe('');
  });

  it('does not cut off a paused utterance, and counts only the time it was playing', () => {
    const { result } = renderHook(() => useSpeechOutput());
    act(() => result.current.speakText('CAT'));
    synth.speaking = true;

    const cancelsBefore = synth.cancel.mock.calls.length;
    act(() => result.current.pause());
    advance(20000);
    expect(result.current.playback).toBe('paused');
    expect(synth.cancel.mock.calls.length).toBe(cancelsBefore);

    act(() => result.current.resume());
    advance(1000);
    expect(result.current.playback).toBe('speaking');
    expect(synth.cancel.mock.calls.length).toBe(cancelsBefore);
  });

  it('starts the next utterance even when the engine was left paused', () => {
    const { result } = renderHook(() => useSpeechOutput());
    synth.paused = true;

    act(() => result.current.speakText('HELLO'));

    expect(synth.resume).toHaveBeenCalled();
    expect(synth.paused).toBe(false);
  });

  it('never runs two utterances at once when Speak is pressed repeatedly', () => {
    const { result } = renderHook(() => useSpeechOutput());
    act(() => result.current.speakText('CAT'));
    synth.speaking = true;
    act(() => result.current.speakText('CAT'));
    act(() => result.current.speakText('CAT'));

    expect(synth.cancel).toHaveBeenCalledTimes(3);
    expect(synth.speak).toHaveBeenCalledTimes(3);
    expect(result.current.playback).toBe('speaking');
  });

  it('stops its checks when the panel unmounts', () => {
    const { result, unmount } = renderHook(() => useSpeechOutput());
    act(() => result.current.speakText('CAT'));
    const cancelsBefore = synth.cancel.mock.calls.length;
    unmount();

    advance(10000);

    expect(synth.cancel.mock.calls.length).toBe(cancelsBefore + 1);
    expect(synth.speak).toHaveBeenCalledTimes(1);
  });
});
