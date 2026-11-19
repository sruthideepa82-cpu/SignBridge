import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import { FRAME_BYTES } from '../lib/audio/pcm.js';
import { TRANSPORT_STATUS, TranscriptionTransport } from './transcriptionTransport.js';

class FakeSocket {
  static created = [];

  constructor(url) {
    this.url = url;
    this.readyState = 0;
    this.sent = [];
    this.bufferedAmount = 0;
    this.closeCalls = 0;
    FakeSocket.created.push(this);
  }

  send(data) {
    if (this.readyState !== 1) throw new Error('socket is not open');
    this.sent.push(data);
  }

  close(code) {
    this.closeCalls += 1;
    if (this.readyState === 3) return;
    this.readyState = 3;
    this.onclose?.({ code: code ?? 1000 });
  }

  // Test helpers: these act as the server or the network.
  open() {
    this.readyState = 1;
    this.onopen?.({});
  }

  receive(message) {
    this.onmessage?.({ data: typeof message === 'string' ? message : JSON.stringify(message) });
  }

  drop(code = 1006) {
    this.readyState = 3;
    this.onclose?.({ code });
  }

  get sentJson() {
    return this.sent.filter((item) => typeof item === 'string').map((item) => JSON.parse(item));
  }

  get sentFrames() {
    return this.sent.filter((item) => item instanceof ArrayBuffer);
  }
}

const frame = (fill = 1) => new Uint8Array(FRAME_BYTES).fill(fill).buffer;

function setup(options = {}) {
  const changes = [];
  const events = [];
  const transport = new TranscriptionTransport({
    url: 'ws://test.local/api/transcription/live',
    createSocket: (url) => new FakeSocket(url),
    onChange: (snapshot) => changes.push(snapshot),
    onEvent: (event) => events.push(event),
    ...options,
  });
  const current = () => FakeSocket.created.at(-1);
  return { transport, changes, events, current };
}

function connectReady(context) {
  context.transport.start();
  const socket = context.current();
  socket.open();
  socket.receive({ type: 'ready' });
  return socket;
}

const eventsOf = (events, type) => events.filter((event) => event.type === type);

beforeEach(() => {
  vi.useFakeTimers();
  FakeSocket.created = [];
});

afterEach(() => {
  vi.useRealTimers();
});

describe('connection lifecycle', () => {
  it('opens one socket and sends the start message after it opens', () => {
    const context = setup();

    context.transport.start();
    const socket = context.current();
    expect(socket.url).toBe('ws://test.local/api/transcription/live');
    expect(socket.sent).toHaveLength(0);

    socket.open();

    expect(socket.sentJson).toEqual([
      { type: 'start', encoding: 'pcm_s16le', sampleRate: 16000, channels: 1, language: 'auto', seqStart: 1 },
    ]);
    expect(context.transport.status).toBe(TRANSPORT_STATUS.CONNECTING);
  });

  it('moves to listening only after the backend says ready', () => {
    const context = setup();
    context.transport.start();
    const socket = context.current();
    socket.open();

    expect(context.transport.status).toBe(TRANSPORT_STATUS.CONNECTING);

    socket.receive({ type: 'ready' });

    expect(context.transport.status).toBe(TRANSPORT_STATUS.LISTENING);
  });

  it('does not start a second connection while one is running', () => {
    const context = setup();
    context.transport.start();
    context.transport.start();

    expect(FakeSocket.created).toHaveLength(1);
  });

  it('changes the language only between sessions', () => {
    const context = setup();
    context.transport.setLanguage('en-IN');
    connectReady(context);

    expect(() => context.transport.setLanguage('hi-IN')).toThrow(/not running/);
    context.transport.stop();
    context.current().receive({ type: 'closed', reason: 'stopped' });
    context.current().drop(1000);
    context.transport.setLanguage('hi-IN');

    expect(context.transport.language).toBe('hi-IN');
  });

  it('sends the chosen language hint in the start message', () => {
    const context = setup({ language: 'hi-IN' });
    context.transport.start();
    context.current().open();

    expect(context.current().sentJson[0]).toMatchObject({ language: 'hi-IN' });
  });

  it('does not send audio before ready, and sends queued frames once ready arrives in order', () => {
    const context = setup();
    context.transport.start();
    const socket = context.current();
    socket.open();
    const first = frame(1);
    const second = frame(2);

    expect(context.transport.sendAudio(first)).toBe(true);
    expect(context.transport.sendAudio(second)).toBe(true);
    expect(socket.sentFrames).toHaveLength(0);

    socket.receive({ type: 'ready' });

    expect(socket.sentFrames).toEqual([first, second]);
  });

  it('sends binary PCM frames unchanged while listening', () => {
    const context = setup();
    const socket = connectReady(context);
    const audio = frame(7);

    expect(context.transport.sendAudio(audio)).toBe(true);

    expect(socket.sentFrames[0]).toBe(audio);
  });

  it('rejects empty, odd-length and oversized frames without sending them', () => {
    const context = setup();
    const socket = connectReady(context);

    expect(context.transport.sendAudio(new ArrayBuffer(0))).toBe(false);
    expect(context.transport.sendAudio(new ArrayBuffer(3201))).toBe(false);
    expect(context.transport.sendAudio(new ArrayBuffer(32002))).toBe(false);

    expect(socket.sentFrames).toHaveLength(0);
    expect(eventsOf(context.events, 'invalid_frame')).toHaveLength(3);
  });

  it('closes the socket and reports a stopped state when the user stops', () => {
    const context = setup();
    const socket = connectReady(context);

    context.transport.stop();
    expect(context.transport.status).toBe(TRANSPORT_STATUS.STOPPING);
    expect(socket.sentJson.at(-1)).toEqual({ type: 'stop' });

    socket.receive({ type: 'closed', reason: 'stopped' });
    socket.drop(1000);

    expect(context.transport.status).toBe(TRANSPORT_STATUS.STOPPED);
    expect(context.transport.sendAudio(frame())).toBe(false);
  });

  it('commits final text that arrives between the stop request and the closed message', () => {
    const context = setup();
    const socket = connectReady(context);
    context.transport.stop();

    socket.receive({ type: 'final', seq: 1, text: 'Last words.' });
    socket.receive({ type: 'closed', reason: 'stopped' });
    socket.drop(1000);

    expect(context.transport.snapshot().transcript.committed).toEqual([{ seq: 1, text: 'Last words.' }]);
  });

  it('stops immediately when no connection is open, and never opens one', () => {
    const context = setup();

    context.transport.stop();

    expect(FakeSocket.created).toHaveLength(0);
    expect(context.transport.status).toBe(TRANSPORT_STATUS.STOPPED);
  });

  it('forces the socket closed if the backend does not confirm the stop in time', () => {
    const context = setup({ stopTimeoutMs: 1000 });
    const socket = connectReady(context);

    context.transport.stop();
    vi.advanceTimersByTime(1000);

    expect(socket.closeCalls).toBeGreaterThan(0);
    expect(context.transport.status).toBe(TRANSPORT_STATUS.STOPPED);
    expect(eventsOf(context.events, 'error').map((event) => event.code)).toContain('stop_timeout');
  });
});

describe('transcript events', () => {
  it('shows interim text, replaces it, and commits the final once', () => {
    const context = setup();
    const socket = connectReady(context);

    socket.receive({ type: 'interim', seq: 1, text: 'Hello' });
    socket.receive({ type: 'interim', seq: 1, text: 'Hello, how are' });
    expect(context.transport.snapshot().transcript.interim).toEqual({ seq: 1, text: 'Hello, how are' });

    socket.receive({ type: 'final', seq: 1, text: 'Hello, how are you?' });
    socket.receive({ type: 'final', seq: 1, text: 'Hello, how are you?' });

    const transcript = context.transport.snapshot().transcript;
    expect(transcript.committed).toEqual([{ seq: 1, text: 'Hello, how are you?' }]);
    expect(transcript.interim).toBeNull();
  });

  it('clears the interim on an empty interim message', () => {
    const context = setup();
    const socket = connectReady(context);
    socket.receive({ type: 'interim', seq: 1, text: 'Unfinished' });

    socket.receive({ type: 'interim', seq: 1, text: '' });

    expect(context.transport.snapshot().transcript.interim).toBeNull();
  });

  it('keeps identical text in separate sequences', () => {
    const context = setup();
    const socket = connectReady(context);

    socket.receive({ type: 'final', seq: 1, text: 'Yes.' });
    socket.receive({ type: 'final', seq: 2, text: 'Yes.' });

    expect(context.transport.snapshot().transcript.committed).toEqual([
      { seq: 1, text: 'Yes.' },
      { seq: 2, text: 'Yes.' },
    ]);
  });

  it('ignores malformed messages without changing state or reporting their text', () => {
    const context = setup();
    const socket = connectReady(context);
    const before = context.transport.snapshot().transcript;

    socket.receive('{"type":"final","seq":"one","text":"secret speech"}');
    socket.receive('not json');

    expect(context.transport.snapshot().transcript).toBe(before);
    expect(context.transport.status).toBe(TRANSPORT_STATUS.LISTENING);
    const reports = eventsOf(context.events, 'protocol_error');
    expect(reports).toHaveLength(2);
    expect(JSON.stringify(context.events)).not.toContain('secret speech');
  });
});

describe('pause and resume', () => {
  it('stops sending frames as soon as pause is requested, then waits for paused', () => {
    const context = setup();
    const socket = connectReady(context);

    expect(context.transport.pause()).toBe(true);
    expect(context.transport.status).toBe(TRANSPORT_STATUS.PAUSING);
    expect(context.transport.sendAudio(frame())).toBe(false);
    expect(socket.sentJson.at(-1)).toEqual({ type: 'pause' });

    socket.receive({ type: 'state', state: 'paused' });

    expect(context.transport.status).toBe(TRANSPORT_STATUS.PAUSED);
    expect(socket.sentFrames).toHaveLength(0);
  });

  it('drops frames queued before the pause so they are not sent after it', () => {
    const context = setup();
    const socket = connectReady(context);
    context.transport.pause();
    context.transport.sendAudio(frame());
    socket.receive({ type: 'state', state: 'paused' });

    expect(socket.sentFrames).toHaveLength(0);
  });

  it('waits for listening after a resume request before sending audio again', () => {
    const context = setup();
    const socket = connectReady(context);
    context.transport.pause();
    socket.receive({ type: 'state', state: 'paused' });

    context.transport.resume();
    const queued = frame(5);
    expect(context.transport.status).toBe(TRANSPORT_STATUS.RESUMING);
    expect(context.transport.sendAudio(queued)).toBe(true);
    expect(socket.sentJson.at(-1)).toEqual({ type: 'resume' });
    expect(socket.sentFrames).toHaveLength(0);

    socket.receive({ type: 'state', state: 'listening' });

    expect(context.transport.status).toBe(TRANSPORT_STATUS.LISTENING);
    expect(socket.sentFrames).toEqual([queued]);
  });

  it('keeps committed text across a pause and a resume', () => {
    const context = setup();
    const socket = connectReady(context);
    socket.receive({ type: 'final', seq: 1, text: 'Before the pause.' });
    context.transport.pause();
    socket.receive({ type: 'state', state: 'paused' });
    context.transport.resume();
    socket.receive({ type: 'state', state: 'listening' });
    socket.receive({ type: 'final', seq: 2, text: 'After the resume.' });

    expect(context.transport.snapshot().transcript.committed.map((entry) => entry.text)).toEqual([
      'Before the pause.',
      'After the resume.',
    ]);
  });

  it('ignores pause and resume requests that do not apply to the current state', () => {
    const context = setup();
    connectReady(context);

    expect(context.transport.resume()).toBe(false);
    context.transport.pause();
    expect(context.transport.pause()).toBe(false);
  });

  it('reports a protocol problem when the backend sends an unexpected state', () => {
    const context = setup();
    const socket = connectReady(context);

    socket.receive({ type: 'state', state: 'paused' });

    expect(context.transport.status).toBe(TRANSPORT_STATUS.LISTENING);
    expect(eventsOf(context.events, 'protocol_error')).toHaveLength(1);
  });

  it('becomes paused without a socket when the pause times out, and resumes with a new connection', () => {
    const context = setup({ controlTimeoutMs: 1000 });
    const socket = connectReady(context);
    context.transport.pause();

    vi.advanceTimersByTime(1000);

    expect(context.transport.status).toBe(TRANSPORT_STATUS.PAUSED);
    expect(eventsOf(context.events, 'error').map((event) => event.code)).toContain('pause_timeout');
    expect(socket.closeCalls).toBeGreaterThan(0);

    context.transport.resume();
    const reconnected = context.current();
    reconnected.open();
    reconnected.receive({ type: 'ready' });

    expect(FakeSocket.created).toHaveLength(2);
    expect(reconnected.sentJson[0]).toMatchObject({ type: 'start', seqStart: 1 });
    expect(context.transport.status).toBe(TRANSPORT_STATUS.LISTENING);
  });

  it('does not reconnect by itself while paused, so no backend session is opened without a request', () => {
    const context = setup();
    const socket = connectReady(context);
    context.transport.pause();
    socket.receive({ type: 'state', state: 'paused' });

    socket.drop(1006);
    vi.advanceTimersByTime(60000);

    expect(context.transport.status).toBe(TRANSPORT_STATUS.PAUSED);
    expect(FakeSocket.created).toHaveLength(1);
  });
});

describe('ping and pong', () => {
  it('sends a ping on the interval while listening, and does not treat a timely pong as a failure', () => {
    const context = setup({ pingIntervalMs: 15000, pongTimeoutMs: 5000 });
    const socket = connectReady(context);

    vi.advanceTimersByTime(15000);
    expect(socket.sentJson.at(-1)).toEqual({ type: 'ping' });

    socket.receive({ type: 'pong' });
    vi.advanceTimersByTime(5000);

    expect(context.transport.status).toBe(TRANSPORT_STATUS.LISTENING);
    expect(socket.closeCalls).toBe(0);
  });

  it('reconnects when the backend stops answering pings', () => {
    const context = setup({ pingIntervalMs: 1000, pongTimeoutMs: 500 });
    connectReady(context);

    vi.advanceTimersByTime(1000);
    vi.advanceTimersByTime(500);

    expect(eventsOf(context.events, 'error').map((event) => event.code)).toContain('pong_timeout');
    expect(context.transport.status).toBe(TRANSPORT_STATUS.RECONNECTING);
  });

  it('does not ping while the socket is connecting', () => {
    const context = setup({ pingIntervalMs: 1000 });
    context.transport.start();
    const socket = context.current();
    socket.open();

    vi.advanceTimersByTime(3000);

    expect(socket.sentJson.some((message) => message.type === 'ping')).toBe(false);
  });
});

describe('reconnection', () => {
  it('reconnects with the first backoff delay after an unexpected drop', () => {
    const context = setup();
    const socket = connectReady(context);

    socket.drop(1006);

    expect(context.transport.status).toBe(TRANSPORT_STATUS.RECONNECTING);
    expect(eventsOf(context.events, 'reconnect_scheduled')[0]).toMatchObject({ attempt: 1, delayMs: 500 });
    expect(FakeSocket.created).toHaveLength(1);

    vi.advanceTimersByTime(500);

    expect(FakeSocket.created).toHaveLength(2);
    expect(context.transport.status).toBe(TRANSPORT_STATUS.CONNECTING);
  });

  it('uses the backoff schedule 500, 1000, 2000, 4000, 8000 and then stops after five attempts', () => {
    const context = setup();
    context.transport.start();
    FakeSocket.created.at(-1).drop(1006);

    const delays = [];
    for (let attempt = 0; attempt < 5; attempt += 1) {
      const scheduled = eventsOf(context.events, 'reconnect_scheduled').at(-1);
      delays.push(scheduled.delayMs);
      vi.advanceTimersByTime(scheduled.delayMs);
      FakeSocket.created.at(-1).drop(1006);
    }

    expect(delays).toEqual([500, 1000, 2000, 4000, 8000]);
    expect(FakeSocket.created).toHaveLength(6);
    expect(context.transport.status).toBe(TRANSPORT_STATUS.FAILED);
    expect(eventsOf(context.events, 'error').map((event) => event.code)).toContain('reconnect_exhausted');
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.created).toHaveLength(6);
  });

  it('resets the attempt count only after the connection has been listening for the stable period', () => {
    const context = setup({ stableMs: 10000 });
    let socket = connectReady(context);
    socket.drop(1006);
    vi.advanceTimersByTime(500);
    socket = context.current();
    socket.open();
    socket.receive({ type: 'ready' });

    vi.advanceTimersByTime(9999);
    socket.drop(1006);
    expect(eventsOf(context.events, 'reconnect_scheduled').at(-1).attempt).toBe(2);

    vi.advanceTimersByTime(1000);
    socket = context.current();
    socket.open();
    socket.receive({ type: 'ready' });
    vi.advanceTimersByTime(10000);
    socket.drop(1006);

    expect(eventsOf(context.events, 'reconnect_scheduled').at(-1)).toMatchObject({ attempt: 1, delayMs: 500 });
  });

  it('continues the sequence numbers after a reconnect, so committed text is not repeated', () => {
    const context = setup();
    const socket = connectReady(context);
    socket.receive({ type: 'final', seq: 1, text: 'First.' });
    socket.receive({ type: 'final', seq: 2, text: 'Second.' });

    socket.drop(1006);
    vi.advanceTimersByTime(500);
    const next = context.current();
    next.open();

    expect(next.sentJson[0]).toMatchObject({ type: 'start', seqStart: 3 });
  });

  it('commits a new final exactly once after the reconnect, and keeps the old committed text', () => {
    const context = setup();
    const socket = connectReady(context);
    socket.receive({ type: 'final', seq: 1, text: 'Kept.' });
    socket.drop(1006);
    vi.advanceTimersByTime(500);
    const next = context.current();
    next.open();
    next.receive({ type: 'ready' });

    next.receive({ type: 'final', seq: 2, text: 'New.' });
    next.receive({ type: 'final', seq: 2, text: 'New.' });

    expect(context.transport.snapshot().transcript.committed).toEqual([
      { seq: 1, text: 'Kept.' },
      { seq: 2, text: 'New.' },
    ]);
  });

  it('keeps unconfirmed interim text as interrupted when the connection drops', () => {
    const context = setup();
    const socket = connectReady(context);
    socket.receive({ type: 'interim', seq: 3, text: 'Half a thought' });

    socket.drop(1006);

    expect(context.transport.snapshot().transcript.interim).toBeNull();
    expect(context.transport.snapshot().transcript.interrupted).toEqual([{ seq: 3, text: 'Half a thought' }]);
  });

  it('drops audio while reconnecting and reports each dropped frame, rather than queuing it without limit', () => {
    const context = setup();
    const socket = connectReady(context);
    socket.drop(1006);

    expect(context.transport.sendAudio(frame())).toBe(false);
    expect(context.transport.sendAudio(frame())).toBe(false);

    expect(context.transport.snapshot().droppedFrames).toBe(2);
    expect(eventsOf(context.events, 'audio_dropped').at(-1)).toMatchObject({ reason: 'reconnecting', total: 2 });
  });

  it('does not retry a non-recoverable error, and moves to failed', () => {
    const context = setup();
    const socket = connectReady(context);

    socket.receive({ type: 'error', code: 'gemini_auth_failed', message: 'Rejected.', recoverable: false });
    socket.drop(1011);

    expect(context.transport.status).toBe(TRANSPORT_STATUS.FAILED);
    expect(context.transport.snapshot().error).toMatchObject({ code: 'gemini_auth_failed', recoverable: false });
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.created).toHaveLength(1);
  });

  it('retries a recoverable error after the connection closes', () => {
    const context = setup();
    const socket = connectReady(context);

    socket.receive({ type: 'error', code: 'gemini_unavailable', message: 'Busy.', recoverable: true });
    socket.drop(1011);

    expect(context.transport.status).toBe(TRANSPORT_STATUS.RECONNECTING);
  });

  it('treats the origin-refused close code as fatal, and does not retry it', () => {
    const context = setup();
    context.transport.start();
    FakeSocket.created.at(-1).drop(1008);

    expect(context.transport.status).toBe(TRANSPORT_STATUS.FAILED);
    vi.advanceTimersByTime(60000);
    expect(FakeSocket.created).toHaveLength(1);
  });

  it('does not run two reconnect loops, even if an old socket reports another close', () => {
    const context = setup();
    const socket = connectReady(context);

    socket.drop(1006);
    socket.drop(1006);
    socket.onclose({ code: 1006 });

    expect(eventsOf(context.events, 'reconnect_scheduled')).toHaveLength(1);
  });

  it('ignores messages from a socket that has already been replaced', () => {
    const context = setup();
    const old = connectReady(context);
    old.drop(1006);
    vi.advanceTimersByTime(500);
    const current = context.current();
    current.open();

    old.receive({ type: 'final', seq: 1, text: 'Ghost.' });

    expect(context.transport.snapshot().transcript.committed).toEqual([]);
    expect(context.transport.status).toBe(TRANSPORT_STATUS.CONNECTING);
  });

  it('reconnects when the backend does not send ready in time', () => {
    const context = setup({ readyTimeoutMs: 2000 });
    context.transport.start();

    vi.advanceTimersByTime(2000);

    expect(eventsOf(context.events, 'error').map((event) => event.code)).toContain('ready_timeout');
    expect(context.transport.status).toBe(TRANSPORT_STATUS.RECONNECTING);
  });

  it('treats a failure to create the socket as a recoverable connection failure', () => {
    let attempts = 0;
    const context = setup({
      createSocket: (url) => {
        attempts += 1;
        if (attempts === 1) throw new Error('blocked');
        return new FakeSocket(url);
      },
    });

    context.transport.start();

    expect(context.transport.status).toBe(TRANSPORT_STATUS.RECONNECTING);
    vi.advanceTimersByTime(500);
    expect(attempts).toBe(2);
  });
});

describe('cleanup', () => {
  it('stops a pending reconnect when the user stops, so no new socket is opened', () => {
    const context = setup();
    const socket = connectReady(context);
    socket.drop(1006);

    context.transport.stop();
    vi.advanceTimersByTime(60000);

    expect(context.transport.status).toBe(TRANSPORT_STATUS.STOPPED);
    expect(FakeSocket.created).toHaveLength(1);
  });

  it('closes the socket and stops every timer on dispose, with no callbacks afterwards', () => {
    const context = setup({ pingIntervalMs: 1000 });
    const socket = connectReady(context);
    const changesBefore = context.changes.length;

    context.transport.dispose();
    vi.advanceTimersByTime(60000);
    socket.receive({ type: 'final', seq: 1, text: 'After dispose.' });

    expect(socket.closeCalls).toBeGreaterThan(0);
    expect(FakeSocket.created).toHaveLength(1);
    expect(context.changes.length).toBe(changesBefore);
    expect(context.transport.snapshot().transcript.committed).toEqual([]);
  });

  it('does not open a socket after dispose during a pending reconnect', () => {
    const context = setup();
    const socket = connectReady(context);
    socket.drop(1006);

    context.transport.dispose();
    vi.advanceTimersByTime(60000);

    expect(FakeSocket.created).toHaveLength(1);
  });
});

describe('memory bounds', () => {
  it('bounds the queue while connecting, keeping only the newest frames', () => {
    const context = setup({ maxQueuedFrames: 10 });
    context.transport.start();
    const socket = context.current();
    const frames = Array.from({ length: 50 }, (_, index) => frame(index));

    for (const item of frames) context.transport.sendAudio(item);
    socket.open();
    socket.receive({ type: 'ready' });

    expect(socket.sentFrames).toEqual(frames.slice(40));
    expect(context.transport.snapshot().droppedFrames).toBe(40);
  });

  it('stops sending when the socket already has too much unsent data buffered', () => {
    const context = setup({ maxBufferedBytes: 64000 });
    const socket = connectReady(context);
    socket.bufferedAmount = 64001;

    expect(context.transport.sendAudio(frame())).toBe(false);

    expect(socket.sentFrames).toHaveLength(0);
    expect(eventsOf(context.events, 'audio_dropped').at(-1).reason).toBe('backpressure');
  });
});
