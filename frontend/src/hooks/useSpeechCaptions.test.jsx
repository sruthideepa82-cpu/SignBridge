import { act, renderHook } from '@testing-library/react';
import { beforeEach, describe, expect, it, vi } from 'vitest';
import { applyDisconnect, applyFinal, applyInterim, createTranscriptState } from '../lib/transcriptState.js';
import { publishSpeechPlayback } from '../lib/speechPlayback.js';
import { activeConversation, conversationActions, CONVERSATIONS_KEY } from '../lib/conversationStore.js';
import { getStoreSnapshot } from '../lib/conversationStore.js';
import { CAPTION_PHASE, PROVIDER } from '../lib/captionPhase.js';
import useSpeechCaptions, { browserRecognitionLanguage } from './useSpeechCaptions.js';

const mocks = vi.hoisted(() => ({
  captures: [],
  transports: [],
  speech: null,
}));

vi.mock('../lib/audio/microphoneCapture.js', async (importOriginal) => {
  const actual = await importOriginal();
  class FakeCapture {
    constructor(options) {
      this.options = options;
      this.state = actual.CAPTURE_STATE.IDLE;
      this.start = vi.fn(async () => {});
      this.stop = vi.fn(async () => {
        this.options.onStateChange(actual.CAPTURE_STATE.IDLE);
      });
      this.pause = vi.fn();
      this.resume = vi.fn();
      this.dispose = vi.fn();
      mocks.captures.push(this);
    }
  }
  return { ...actual, MicrophoneCapture: FakeCapture };
});

vi.mock('../services/transcriptionTransport.js', async (importOriginal) => {
  const actual = await importOriginal();
  const { TRANSPORT_STATUS: S } = actual;
  class FakeTransport {
    constructor(options) {
      this.language = options.language;
      this.onChange = options.onChange;
      this.onEvent = options.onEvent;
      this.status = S.IDLE;
      this.transcript = createTranscriptState();
      this.error = null;
      this.droppedFrames = 0;
      this.sendAudio = vi.fn(() => true);
      this.setLanguage = vi.fn((language) => {
        this.language = language;
      });
      this.start = vi.fn(() => {
        this.status = S.CONNECTING;
        this.emit();
      });
      this.stop = vi.fn(() => {
        this.status = S.STOPPING;
        this.emit();
      });
      this.pause = vi.fn(() => {
        if (this.status !== S.LISTENING) return false;
        this.status = S.PAUSING;
        this.emit();
        return true;
      });
      this.resume = vi.fn(() => {
        if (this.status !== S.PAUSED) return false;
        this.status = S.RESUMING;
        this.emit();
        return true;
      });
      this.dispose = vi.fn();
      mocks.transports.push(this);
    }

    emit() {
      this.onChange({ status: this.status, transcript: this.transcript, error: this.error, droppedFrames: this.droppedFrames });
    }
  }
  return { ...actual, TranscriptionTransport: FakeTransport };
});

vi.mock('./useSpeechRecognition.js', () => ({
  default: () => mocks.speech,
}));

const cap = () => mocks.captures.at(-1);
const tr = () => mocks.transports.at(-1);

function freshSpeech() {
  return {
    supported: true,
    status: 'idle',
    interim: '',
    error: '',
    permission: 'unknown',
    start: vi.fn(),
    stop: vi.fn(),
  };
}

// Simulates the microphone reporting a state change, as the real capture does.
function captureSays(state) {
  act(() => {
    cap().state = state;
    cap().options.onStateChange(state);
  });
}

// Simulates the Gemini transport reporting a new status.
function transportSays(status, patch = {}) {
  act(() => {
    Object.assign(tr(), patch);
    tr().status = status;
    tr().emit();
  });
}

// Simulates a server message, using the real transcript reducer.
function serverFinal(seq, text) {
  act(() => {
    tr().transcript = applyFinal(tr().transcript, { seq, text }).state;
    tr().emit();
  });
}

function serverInterim(seq, text) {
  act(() => {
    tr().transcript = applyInterim(tr().transcript, { seq, text }).state;
    tr().emit();
  });
}

function transportEvent(event) {
  act(() => tr().onEvent(event));
}

function connectedAndListening(result) {
  act(() => result.current.start());
  captureSays('capturing');
  transportSays('listening');
  return result.current;
}

beforeEach(() => {
  mocks.captures.length = 0;
  mocks.transports.length = 0;
  mocks.speech = freshSpeech();
  window.localStorage.clear();
  publishSpeechPlayback('idle');
});

describe('initial state', () => {
  it('starts idle, using Gemini, with nothing sent and nothing requested', () => {
    const { result } = renderHook(() => useSpeechCaptions());

    expect(result.current.phase).toBe(CAPTION_PHASE.IDLE);
    expect(result.current.provider).toBe(PROVIDER.GEMINI);
    expect(result.current.draft).toBe('');
    expect(result.current.canStart).toBe(true);
    expect(result.current.canPause).toBe(false);
    expect(result.current.canResume).toBe(false);
    expect(result.current.canStop).toBe(false);
    expect(mocks.captures).toHaveLength(0);
    expect(mocks.transports).toHaveLength(0);
  });

  it('maps the language to the browser fallback language', () => {
    expect(browserRecognitionLanguage('hi-IN')).toBe('hi-IN');
    expect(browserRecognitionLanguage('auto')).toBe('en-IN');
    expect(browserRecognitionLanguage('en-IN')).toBe('en-IN');
  });
});

describe('start and permission', () => {
  it('asks for the microphone straight from the start action, and shows the permission state', () => {
    const { result } = renderHook(() => useSpeechCaptions());

    act(() => result.current.start());
    expect(cap().start).toHaveBeenCalledTimes(1);
    captureSays('requesting');

    expect(result.current.phase).toBe(CAPTION_PHASE.REQUESTING_PERMISSION);
    expect(result.current.micActive).toBe(true);
    expect(mocks.transports).toHaveLength(0);
  });

  it('connects to Gemini only after the microphone has been granted', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    act(() => result.current.start());
    captureSays('requesting');

    captureSays('capturing');

    expect(tr().setLanguage).toHaveBeenCalledWith('auto');
    expect(tr().start).toHaveBeenCalledTimes(1);
    expect(result.current.phase).toBe(CAPTION_PHASE.CONNECTING);
  });

  it('shows a clear error and never connects when permission is denied', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    act(() => result.current.start());

    act(() => cap().options.onError({ code: 'permission_denied', message: 'Microphone permission was denied.' }));

    expect(result.current.error).toBe('Microphone permission was denied.');
    expect(result.current.phase).toBe(CAPTION_PHASE.ERROR);
    expect(mocks.transports).toHaveLength(0);
  });

  it('ignores a second start while a session is running', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);

    act(() => result.current.start());

    expect(cap().start).toHaveBeenCalledTimes(1);
  });
});

describe('transcript and draft', () => {
  it('shows interim text in place and never adds it to the draft', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);

    serverInterim(1, 'Hello');
    serverInterim(1, 'Hello, how are');

    expect(result.current.interimText).toBe('Hello, how are');
    expect(result.current.draft).toBe('');
    expect(result.current.phase).toBe(CAPTION_PHASE.RECEIVING);
  });

  it('adds each final sentence to the draft exactly once', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);

    serverFinal(1, 'Hello, how are you?');
    serverFinal(1, 'Hello, how are you?');
    serverFinal(2, 'I am fine.');

    expect(result.current.draft).toBe('Hello, how are you? I am fine.');
    expect(result.current.interimText).toBe('');
  });

  it('keeps identical sentences that arrive as separate segments', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);

    serverFinal(1, 'Yes.');
    serverFinal(2, 'Yes.');

    expect(result.current.draft).toBe('Yes. Yes.');
  });

  it('keeps the user edits when a new sentence arrives', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverFinal(1, 'Hello.');

    act(() => result.current.setDraft('Hi, my friend.'));
    serverFinal(2, 'Nice to meet you.');

    expect(result.current.draft).toBe('Hi, my friend. Nice to meet you.');
  });
});

describe('pause and resume', () => {
  it('stops transmission on pause and keeps the microphone on', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);

    act(() => result.current.pause());
    transportSays('paused');

    expect(tr().pause).toHaveBeenCalled();
    expect(cap().pause).toHaveBeenCalled();
    expect(result.current.phase).toBe(CAPTION_PHASE.PAUSED);
    expect(result.current.micActive).toBe(true);
    expect(result.current.canResume).toBe(true);
  });

  it('resumes both the transport and the microphone', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    act(() => result.current.pause());
    transportSays('paused');

    act(() => result.current.resume());

    expect(cap().resume).toHaveBeenCalled();
    expect(tr().resume).toHaveBeenCalled();
    expect(result.current.userPaused).toBe(false);
  });

  it('pauses while Read Aloud is speaking, and resumes afterwards when the user had not paused', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);

    act(() => publishSpeechPlayback('speaking'));
    transportSays('paused');

    expect(tr().pause).toHaveBeenCalled();
    expect(cap().pause).toHaveBeenCalled();
    expect(result.current.phase).toBe(CAPTION_PHASE.PAUSED);
    expect(result.current.autoPaused).toBe(true);

    act(() => publishSpeechPlayback('idle'));

    expect(cap().resume).toHaveBeenCalled();
    expect(tr().resume).toHaveBeenCalled();
  });

  it('does not resume after Read Aloud when the user had paused transcription themselves', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    act(() => result.current.pause());
    transportSays('paused');
    tr().resume.mockClear();
    cap().resume.mockClear();

    act(() => publishSpeechPlayback('speaking'));
    act(() => publishSpeechPlayback('idle'));

    expect(tr().resume).not.toHaveBeenCalled();
    expect(cap().resume).not.toHaveBeenCalled();
    expect(result.current.phase).toBe(CAPTION_PHASE.PAUSED);
  });

  it('pauses during Read Aloud even when the session is still connecting, and resumes the microphone afterwards', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    act(() => result.current.start());
    captureSays('capturing');

    act(() => publishSpeechPlayback('speaking'));
    expect(cap().pause).toHaveBeenCalled();

    act(() => publishSpeechPlayback('idle'));
    expect(cap().resume).toHaveBeenCalled();
  });
});

describe('stop and cleanup', () => {
  it('releases the microphone first, then stops the transport', async () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    const order = [];
    cap().stop.mockImplementation(async () => {
      order.push('mic');
      cap().options.onStateChange('idle');
    });
    tr().stop.mockImplementation(() => {
      order.push('transport');
    });

    await act(() => result.current.stop());

    expect(order).toEqual(['mic', 'transport']);
    expect(result.current.micActive).toBe(false);
  });

  it('shows stopped and allows a new start once the session has ended', async () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    await act(() => result.current.stop());
    transportSays('stopped');

    expect(result.current.canStart).toBe(true);
    expect(result.current.phase).toBe(CAPTION_PHASE.IDLE);
  });

  it('releases the microphone when the connection fails for good', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);

    transportSays('failed', { error: { code: 'gemini_auth_failed', message: 'x', recoverable: false } });

    expect(cap().stop).toHaveBeenCalled();
    expect(result.current.phase).toBe(CAPTION_PHASE.ERROR);
  });

  it('disposes the microphone and the transport on unmount', () => {
    const { result, unmount } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    const capture = cap();
    const transport = tr();

    unmount();

    expect(capture.dispose).toHaveBeenCalled();
    expect(transport.dispose).toHaveBeenCalled();
  });

  it('stops browser recognition on unmount if the fallback is running', () => {
    const { result, unmount } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    transportSays('failed', { error: { code: 'gemini_unavailable', message: 'x', recoverable: true } });
    act(() => result.current.startFallback());

    unmount();

    expect(mocks.speech.stop).toHaveBeenCalled();
  });
});

describe('reconnect and interruptions', () => {
  it('keeps the committed transcript and the draft while reconnecting', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverFinal(1, 'Before the drop.');

    transportSays('reconnecting');

    expect(result.current.phase).toBe(CAPTION_PHASE.RECONNECTING);
    expect(result.current.draft).toBe('Before the drop.');
  });

  it('warns that speech may be missing after frames were dropped', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);

    transportEvent({ type: 'audio_dropped', reason: 'reconnecting', total: 3 });
    transportSays('listening');

    expect(result.current.interrupted).toBe(true);
    expect(result.current.phase).toBe(CAPTION_PHASE.INTERRUPTED);
  });

  it('keeps unconfirmed speech visible as incomplete after a drop', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverInterim(2, 'Half of a thought');
    act(() => {
      tr().transcript = applyDisconnect(tr().transcript);
      tr().emit();
    });
    transportEvent({ type: 'interrupted' });

    expect(result.current.interruptedEntries).toEqual([{ seq: 2, text: 'Half of a thought' }]);
    expect(result.current.interimText).toBe('');
    expect(result.current.draft).toBe('');
  });

  it('does not clear the draft on reconnect', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    act(() => result.current.setDraft('Typed by hand.'));

    transportSays('reconnecting');
    transportSays('connecting');

    expect(result.current.draft).toBe('Typed by hand.');
  });

  it('continues sequence numbers through the transport, so a reconnect does not repeat committed sentences', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverFinal(1, 'First.');
    transportSays('reconnecting');
    transportSays('listening');

    serverFinal(2, 'Second.');

    expect(result.current.draft).toBe('First. Second.');
  });
});

describe('clear transcript', () => {
  it('clears the draft and the incomplete notes, and leaves the conversation history alone', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverFinal(1, 'Keep in the conversation.');
    act(() => result.current.send((message) => conversationActions.append({ ...message, source: 'speech' })));
    serverFinal(2, 'Draft only.');
    const before = activeConversation(getStoreSnapshot())?.messages.length;

    act(() => result.current.clear());

    expect(result.current.draft).toBe('');
    expect(activeConversation(getStoreSnapshot())?.messages.length).toBe(before);
    expect(result.current.notice).toMatch(/Conversation messages are kept/);
  });

  it('does not bring cleared sentences back when new speech arrives', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverFinal(1, 'Old.');
    act(() => result.current.clear());

    serverFinal(2, 'New.');

    expect(result.current.draft).toBe('New.');
  });
});

describe('language selection', () => {
  it('can be chosen while idle and applied when listening starts', () => {
    const { result } = renderHook(() => useSpeechCaptions());

    let accepted;
    act(() => {
      accepted = result.current.setLanguage('hi-IN');
    });
    expect(accepted).toBe(true);

    act(() => result.current.start());
    captureSays('capturing');

    expect(tr().setLanguage).toHaveBeenCalledWith('hi-IN');
    expect(result.current.language).toBe('hi-IN');
  });

  it('cannot be changed while a session is running', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);

    let accepted;
    act(() => {
      accepted = result.current.setLanguage('en-IN');
    });

    expect(accepted).toBe(false);
    expect(result.current.language).toBe('auto');
  });
});

describe('sending to the conversation', () => {
  it('sends the confirmed text as hearing speech through the given send function, then clears the draft', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverFinal(1, 'Please repeat that.');
    const send = vi.fn();

    let sent;
    act(() => {
      sent = result.current.send(send);
    });

    expect(sent).toBe(true);
    expect(send).toHaveBeenCalledTimes(1);
    expect(send).toHaveBeenCalledWith({ text: 'Please repeat that.', source: 'speech', speaker: 'hearing' });
    expect(result.current.draft).toBe('');
  });

  it('keeps the draft when the send fails, and says so', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverFinal(1, 'Keep me.');

    act(() => {
      result.current.send(() => {
        throw new Error('storage blocked');
      });
    });

    expect(result.current.draft).toBe('Keep me.');
    expect(result.current.sendError).toMatch(/still here/);
  });

  it('does nothing for an empty draft, and never sends interim text', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverInterim(1, 'Not confirmed yet');
    const send = vi.fn();

    let sent;
    act(() => {
      sent = result.current.send(send);
    });

    expect(sent).toBe(false);
    expect(send).not.toHaveBeenCalled();
  });

  it('appends exactly one message to the existing conversation when sent through the real store', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverFinal(1, 'One message only.');

    act(() => {
      result.current.send((message) => conversationActions.append(message));
    });

    const conversation = activeConversation(getStoreSnapshot());
    const speechMessages = conversation.messages.filter((message) => message.source === 'speech');
    expect(speechMessages).toHaveLength(1);
    expect(speechMessages[0]).toMatchObject({ text: 'One message only.', speaker: 'hearing', source: 'speech' });
    expect(window.localStorage.getItem(CONVERSATIONS_KEY)).toContain('One message only.');
  });
});

describe('error messages', () => {
  it('shows a plain sentence for a Gemini configuration error, and offers no fallback for it', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);

    transportSays('failed', { error: { code: 'gemini_auth_failed', message: 'raw server text', recoverable: false } });

    expect(result.current.error).toMatch(/API key/);
    expect(result.current.error).not.toContain('raw server text');
    expect(result.current.fallbackOffered).toBe(false);
  });
});

describe('browser recognition fallback', () => {
  function failedWithServiceError(result) {
    connectedAndListening(result);
    transportSays('failed', { error: { code: 'gemini_unavailable', message: 'busy', recoverable: true } });
  }

  it('is offered only after a recoverable service failure, and never started silently', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    failedWithServiceError(result);

    expect(result.current.fallbackOffered).toBe(true);
    expect(mocks.speech.start).not.toHaveBeenCalled();
  });

  it('turns on only when the user chooses it, and then reports the browser provider', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    failedWithServiceError(result);

    act(() => result.current.startFallback());

    expect(mocks.speech.start).toHaveBeenCalledWith(expect.any(Function));
    expect(result.current.fallbackActive).toBe(true);
    expect(result.current.provider).toBe(PROVIDER.BROWSER);
    expect(result.current.notice).toMatch(/Gemini is not in use/);
  });

  it('never runs Gemini and the browser recognition at the same time', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    failedWithServiceError(result);
    act(() => result.current.startFallback());

    expect(result.current.canStart).toBe(false);
    act(() => result.current.start());
    expect(cap().start).toHaveBeenCalledTimes(1);
  });

  it('adds browser final text to the same draft, once per result', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    failedWithServiceError(result);
    act(() => result.current.startFallback());
    const onFinal = mocks.speech.start.mock.calls[0][0];

    act(() => onFinal('Hello from the browser.'));

    expect(result.current.draft).toBe('Hello from the browser.');
  });

  it('shows browser interim text separately from the draft', () => {
    const { result, rerender } = renderHook(() => useSpeechCaptions());
    failedWithServiceError(result);
    act(() => result.current.startFallback());
    mocks.speech.interim = 'Still talking';

    rerender();

    expect(result.current.interimText).toBe('Still talking');
    expect(result.current.draft).toBe('');
  });

  it('stops the browser recognition when the user stops', async () => {
    const { result } = renderHook(() => useSpeechCaptions());
    failedWithServiceError(result);
    act(() => result.current.startFallback());

    await act(() => result.current.stop());

    expect(mocks.speech.stop).toHaveBeenCalled();
    expect(result.current.fallbackActive).toBe(false);
  });

  it('reports the browser fallback as unavailable on unsupported browsers', () => {
    mocks.speech = { ...freshSpeech(), supported: false };
    const { result } = renderHook(() => useSpeechCaptions());
    failedWithServiceError(result);

    act(() => result.current.startFallback());

    expect(mocks.speech.start).not.toHaveBeenCalled();
    expect(result.current.browserSupported).toBe(false);
    expect(result.current.fallbackActive).toBe(false);
  });

  it('ends the fallback and shows the error if the browser recognition fails', () => {
    const { result, rerender } = renderHook(() => useSpeechCaptions());
    failedWithServiceError(result);
    act(() => result.current.startFallback());

    mocks.speech.status = 'error';
    mocks.speech.error = 'Microphone access was blocked.';
    rerender();

    expect(result.current.fallbackActive).toBe(false);
  });

  it('pauses the browser recognition during Read Aloud and restarts it afterwards', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    failedWithServiceError(result);
    act(() => result.current.startFallback());
    const onFinal = mocks.speech.start.mock.calls[0][0];

    act(() => publishSpeechPlayback('speaking'));
    expect(mocks.speech.stop).toHaveBeenCalled();

    act(() => publishSpeechPlayback('idle'));
    expect(mocks.speech.start).toHaveBeenLastCalledWith(onFinal);
  });
});

describe('read aloud coordination details', () => {
  it('does not pause an idle session, and does not touch the microphone', () => {
    renderHook(() => useSpeechCaptions());

    act(() => publishSpeechPlayback('speaking'));
    act(() => publishSpeechPlayback('idle'));

    expect(mocks.captures).toHaveLength(0);
    expect(mocks.transports).toHaveLength(0);
  });
});

describe('transport failure without a reason', () => {
  it('shows a plain message instead of a missing code', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);

    transportSays('failed', { error: null });

    expect(result.current.error).toMatch(/stopped unexpectedly/);
  });
});

function failedWithServiceError(result) {
  connectedAndListening(result);
  transportSays('failed', { error: { code: 'gemini_unavailable', message: 'busy', recoverable: true } });
}

describe('clear transcript (stage 4.1)', () => {
  it('removes the visible interim text', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverInterim(3, 'Half of a sentence');

    act(() => result.current.clear());

    expect(result.current.interimText).toBe('');
  });

  it('removes incomplete notes from before a drop', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverInterim(2, 'Lost in the drop');
    act(() => {
      tr().transcript = applyDisconnect(tr().transcript);
      tr().emit();
    });
    expect(result.current.interruptedEntries).toHaveLength(1);

    act(() => result.current.clear());

    expect(result.current.interruptedEntries).toEqual([]);
  });

  it('ignores late interim events from the cleared segment', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverInterim(3, 'Hel');
    act(() => result.current.clear());

    serverInterim(3, 'Hello again');

    expect(result.current.interimText).toBe('');
    expect(result.current.draft).toBe('');
  });

  it('does not let a late final for the cleared segment reappear in the draft', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverInterim(3, 'Hel');
    act(() => result.current.clear());

    serverFinal(3, 'Hello.');

    expect(result.current.draft).toBe('');
    serverFinal(4, 'Next sentence.');
    expect(result.current.draft).toBe('Next sentence.');
  });

  it('does not bring back incomplete text from the cleared segment when the connection drops later', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverInterim(3, 'Cleared words');
    act(() => result.current.clear());

    act(() => {
      tr().transcript = applyDisconnect(tr().transcript);
      tr().emit();
    });

    expect(result.current.interruptedEntries).toEqual([]);
  });

  it('keeps the transport sequence watermark intact', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverFinal(1, 'Before clear.');
    serverFinal(2, 'Also before.');
    const watermarkBefore = tr().transcript.lastCommittedSequence;

    act(() => result.current.clear());

    expect(tr().transcript.lastCommittedSequence).toBe(watermarkBefore);
    expect(tr().transcript.lastCommittedSequence).toBe(2);
  });

  it('does not stop the microphone or the Gemini session', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverInterim(1, 'Speaking');

    act(() => result.current.clear());

    expect(cap().stop).not.toHaveBeenCalled();
    expect(tr().stop).not.toHaveBeenCalled();
    expect(result.current.micActive).toBe(true);
    expect(result.current.phase).toBe(CAPTION_PHASE.LISTENING);
  });

  it('leaves the conversation history exactly as it was', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    connectedAndListening(result);
    serverFinal(1, 'Sent earlier.');
    act(() => {
      result.current.send((message) => conversationActions.append(message));
    });
    serverFinal(2, 'Draft only.');
    const historyBefore = JSON.stringify(activeConversation(getStoreSnapshot())?.messages);

    act(() => result.current.clear());

    expect(JSON.stringify(activeConversation(getStoreSnapshot())?.messages)).toBe(historyBefore);
  });

  it('drops the browser result for the speech that was on screen, and nothing after it', () => {
    const { result } = renderHook(() => useSpeechCaptions());
    failedWithServiceError(result);
    act(() => result.current.startFallback());
    const onFinal = mocks.speech.start.mock.calls[0][0];
    mocks.speech.interim = 'Being said now';
    act(() => result.current.clear());
    expect(result.current.interimText).toBe('');

    act(() => onFinal('Being said now.'));
    expect(result.current.draft).toBe('');

    act(() => onFinal('A new sentence.'));
    expect(result.current.draft).toBe('A new sentence.');
  });

  it('hides browser interim text that was on screen at the clear, until the browser moves on', () => {
    const { result, rerender } = renderHook(() => useSpeechCaptions());
    failedWithServiceError(result);
    act(() => result.current.startFallback());
    mocks.speech.interim = 'Old partial';
    rerender();
    act(() => result.current.clear());

    rerender();
    expect(result.current.interimText).toBe('');

    mocks.speech.interim = 'New partial';
    rerender();
    expect(result.current.interimText).toBe('New partial');
  });
});

describe('browser fallback language', () => {
  function fallbackFor(language) {
    const { result } = renderHook(() => useSpeechCaptions());
    if (language !== 'auto') act(() => result.current.setLanguage(language));
    failedWithServiceError(result);
    act(() => result.current.startFallback());
    return result.current;
  }

  it('uses English (India) and flags it as automatic-detection fallback when Auto is selected', () => {
    const state = fallbackFor('auto');

    expect(state.fallbackLanguage).toBe('en-IN');
    expect(state.fallbackAutoLanguage).toBe(true);
    expect(mocks.speech.start).toHaveBeenCalled();
  });

  it('keeps an explicit English choice', () => {
    const state = fallbackFor('en-IN');

    expect(state.fallbackLanguage).toBe('en-IN');
    expect(state.fallbackAutoLanguage).toBe(false);
  });

  it('keeps an explicit Hindi choice when browser recognition is asked for Hindi', () => {
    const state = fallbackFor('hi-IN');

    expect(state.fallbackLanguage).toBe('hi-IN');
    expect(state.fallbackAutoLanguage).toBe(false);
    expect(state.language).toBe('hi-IN');
  });
});
