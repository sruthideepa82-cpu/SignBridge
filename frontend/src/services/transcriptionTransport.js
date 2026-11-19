import {
  EFFECT,
  applyDisconnect,
  applyFinal,
  applyInterim,
  createTranscriptState,
} from '../lib/transcriptState.js';
import {
  DEFAULT_LANGUAGE,
  assertLanguage,
  buildControlMessage,
  buildStartMessage,
  buildTranscriptionSocketUrl,
  isFatalCloseCode,
  isValidAudioFrame,
  parseServerMessage,
} from './transcriptionProtocol.js';

// WebSocket transport for speech transcription. It owns one connection at a time, sends microphone frames only while
// the backend is listening, and reconnects after recoverable drops. It holds transport-level transcript state only.

export const TRANSPORT_STATUS = Object.freeze({
  IDLE: 'idle',
  CONNECTING: 'connecting',
  LISTENING: 'listening',
  PAUSING: 'pausing',
  PAUSED: 'paused',
  RESUMING: 'resuming',
  RECONNECTING: 'reconnecting',
  STOPPING: 'stopping',
  STOPPED: 'stopped',
  FAILED: 'failed',
});

export const RECONNECT_DELAYS_MS = Object.freeze([500, 1000, 2000, 4000, 8000]);

const WS_OPEN = 1;

const DEFAULT_TIMING = Object.freeze({
  pingIntervalMs: 15000,
  pongTimeoutMs: 5000,
  readyTimeoutMs: 10000,
  controlTimeoutMs: 5000,
  stopTimeoutMs: 5000,
  // A connection must stay listening this long before the reconnect count is reset.
  stableMs: 10000,
  // About one second of audio. Frames beyond this are dropped, so the queue never grows without bound.
  maxQueuedFrames: 10,
  // Frames are not sent while the socket has this many bytes waiting. The browser otherwise buffers without limit.
  maxBufferedBytes: 64000,
});

const TIMER_KEYS = ['ready', 'ping', 'pong', 'control', 'stop', 'reconnect', 'stable'];

export class TranscriptionTransport {
  constructor({
    url = buildTranscriptionSocketUrl(),
    language = DEFAULT_LANGUAGE,
    createSocket = (target) => new WebSocket(target),
    onChange = () => {},
    onEvent = () => {},
    reconnectDelaysMs = RECONNECT_DELAYS_MS,
    ...timing
  } = {}) {
    this.url = url;
    this.language = assertLanguage(language);
    this.createSocket = createSocket;
    this.onChange = onChange;
    this.onEvent = onEvent;
    this.reconnectDelaysMs = reconnectDelaysMs;
    this.timing = { ...DEFAULT_TIMING, ...timing };
    this.status = TRANSPORT_STATUS.IDLE;
    this.transcript = createTranscriptState();
    this.error = null;
    this.droppedFrames = 0;
    this.socket = null;
    this.generation = 0;
    this.queue = [];
    this.attempts = 0;
    this.userStopped = false;
    this.disposed = false;
    this.timers = Object.fromEntries(TIMER_KEYS.map((key) => [key, null]));
  }

  snapshot() {
    return {
      status: this.status,
      transcript: this.transcript,
      error: this.error,
      droppedFrames: this.droppedFrames,
    };
  }

  // The language is sent in the start message, so it can only change between sessions.
  setLanguage(language) {
    if (![TRANSPORT_STATUS.IDLE, TRANSPORT_STATUS.STOPPED, TRANSPORT_STATUS.FAILED].includes(this.status)) {
      throw new Error('The language can only be changed when transcription is not running.');
    }
    this.language = assertLanguage(language);
  }

  start() {
    if (![TRANSPORT_STATUS.IDLE, TRANSPORT_STATUS.STOPPED, TRANSPORT_STATUS.FAILED].includes(this.status)) return;
    this.userStopped = false;
    this.error = null;
    this.attempts = 0;
    this.open();
  }

  // Sends one 16 kHz PCM frame. Returns true when the frame was sent or queued, false when it was dropped or not
  // allowed in the current state.
  sendAudio(frame) {
    if (!isValidAudioFrame(frame)) {
      this.onEvent({ type: 'invalid_frame' });
      return false;
    }
    switch (this.status) {
      case TRANSPORT_STATUS.LISTENING:
        if (!this.socket || this.socket.readyState !== WS_OPEN) return this.drop('not_open');
        if (this.socket.bufferedAmount > this.timing.maxBufferedBytes) return this.drop('backpressure');
        this.socket.send(frame);
        return true;
      case TRANSPORT_STATUS.CONNECTING:
      case TRANSPORT_STATUS.RESUMING:
        if (this.queue.length >= this.timing.maxQueuedFrames) {
          this.queue.shift();
          this.recordDrop('queue_full');
        }
        this.queue.push(frame);
        return true;
      case TRANSPORT_STATUS.RECONNECTING:
        return this.drop('reconnecting');
      default:
        // Paused, pausing, stopping, stopped, failed or idle: audio is intentionally not sent.
        return false;
    }
  }

  pause() {
    if (this.status !== TRANSPORT_STATUS.LISTENING) return false;
    // Stop before the message goes out, so no frame follows the pause request.
    this.queue = [];
    this.setStatus(TRANSPORT_STATUS.PAUSING);
    this.send(buildControlMessage('pause'));
    this.startTimer('control', this.timing.controlTimeoutMs, () => this.abortSocket('pause_timeout', 'Transcription did not pause in time.'));
    return true;
  }

  resume() {
    if (this.status !== TRANSPORT_STATUS.PAUSED) return false;
    if (!this.socket) {
      // The connection was lost while paused, and the backend session had already been closed. Open a new one.
      this.error = null;
      this.attempts = 0;
      this.open();
      return true;
    }
    this.queue = [];
    this.setStatus(TRANSPORT_STATUS.RESUMING);
    this.send(buildControlMessage('resume'));
    this.startTimer('control', this.timing.controlTimeoutMs, () => this.abortSocket('resume_timeout', 'Transcription did not resume in time.'));
    return true;
  }

  stop() {
    this.userStopped = true;
    this.clearTimer('reconnect');
    this.queue = [];
    if (!this.socket) {
      this.finishStop();
      return;
    }
    if (this.status === TRANSPORT_STATUS.STOPPING) return;
    if (this.socket.readyState !== WS_OPEN || this.status === TRANSPORT_STATUS.CONNECTING) {
      this.abortSocket(null, null);
      return;
    }
    this.setStatus(TRANSPORT_STATUS.STOPPING);
    this.send(buildControlMessage('stop'));
    this.startTimer('stop', this.timing.stopTimeoutMs, () => this.abortSocket('stop_timeout', 'Transcription did not stop cleanly.'));
  }

  // For unmounting. Stops every timer and the socket, and no further callbacks are made.
  dispose() {
    this.disposed = true;
    this.generation += 1;
    this.queue = [];
    for (const key of TIMER_KEYS) this.clearTimer(key);
    const socket = this.socket;
    this.socket = null;
    socket?.close?.();
    this.status = TRANSPORT_STATUS.STOPPED;
  }

  open() {
    this.generation += 1;
    const generation = this.generation;
    this.queue = [];
    this.setStatus(TRANSPORT_STATUS.CONNECTING);

    let socket;
    try {
      socket = this.createSocket(this.url);
    } catch {
      this.error = { code: 'connection_failed', message: 'The transcription connection could not be opened.', recoverable: true };
      this.handleClose(undefined, generation, null);
      return;
    }
    this.socket = socket;
    const current = () => generation === this.generation && socket === this.socket;

    socket.onopen = () => {
      if (!current()) return;
      socket.send(
        JSON.stringify(
          buildStartMessage({ language: this.language, seqStart: this.transcript.lastCommittedSequence + 1 }),
        ),
      );
    };
    socket.onmessage = (event) => {
      if (current()) this.handleMessage(event.data);
    };
    socket.onerror = () => {
      // A close event always follows a socket error, and that is where recovery is decided.
    };
    socket.onclose = (event) => {
      if (current()) this.handleClose(event?.code, generation, socket);
    };
    this.startTimer('ready', this.timing.readyTimeoutMs, () =>
      this.abortSocket('ready_timeout', 'The transcription service did not respond in time.'),
    );
  }

  handleMessage(raw) {
    const message = parseServerMessage(raw);
    // Raw text is never reported, because it can contain the user's speech.
    if (!message) {
      this.onEvent({ type: 'protocol_error', reason: 'malformed' });
      return;
    }
    switch (message.type) {
      case 'ready':
        if (this.status !== TRANSPORT_STATUS.CONNECTING) return;
        this.clearTimer('ready');
        this.error = null;
        this.startPingTimer();
        this.startTimer('stable', this.timing.stableMs, () => {
          this.attempts = 0;
          this.timers.stable = null;
        });
        this.setStatus(TRANSPORT_STATUS.LISTENING);
        this.flushQueue();
        return;
      case 'state':
        this.handleState(message.state);
        return;
      case 'interim':
      case 'final':
        this.applyTranscript(message);
        return;
      case 'error':
        this.error = { code: message.code, message: message.message, recoverable: message.recoverable };
        this.onEvent({ type: 'error', code: message.code, recoverable: message.recoverable });
        this.emit();
        return;
      case 'pong':
        this.clearTimer('pong');
        return;
      case 'closed':
        // The socket closes next. Recovery is decided there.
        return;
      default:
        this.onEvent({ type: 'protocol_error', reason: 'unknown_type' });
    }
  }

  handleState(state) {
    if (state === 'listening' && this.status === TRANSPORT_STATUS.RESUMING) {
      this.clearTimer('control');
      this.setStatus(TRANSPORT_STATUS.LISTENING);
      this.flushQueue();
    } else if (state === 'paused' && this.status === TRANSPORT_STATUS.PAUSING) {
      this.clearTimer('control');
      this.queue = [];
      this.setStatus(TRANSPORT_STATUS.PAUSED);
    } else {
      this.onEvent({ type: 'protocol_error', reason: 'unexpected_state' });
    }
  }

  applyTranscript(message) {
    const apply = message.type === 'interim' ? applyInterim : applyFinal;
    const { state, effect } = apply(this.transcript, message);
    if (effect === EFFECT.STALE || effect === EFFECT.DUPLICATE || effect === EFFECT.IGNORED) return;
    if (state === this.transcript) return;
    this.transcript = state;
    this.emit();
  }

  handleClose(code, generation, socket) {
    if (generation !== this.generation) return;
    if (socket && socket !== this.socket) return;
    this.socket = null;
    this.queue = [];
    for (const key of ['ready', 'ping', 'pong', 'control', 'stop', 'stable']) this.clearTimer(key);

    if (this.userStopped || this.status === TRANSPORT_STATUS.STOPPING) {
      this.finishStop();
      return;
    }
    if (isFatalCloseCode(code) || (this.error && this.error.recoverable === false)) {
      this.transcript = applyDisconnect(this.transcript);
      this.clearTimer('reconnect');
      this.setStatus(TRANSPORT_STATUS.FAILED);
      return;
    }
    if (
      this.status === TRANSPORT_STATUS.PAUSING ||
      this.status === TRANSPORT_STATUS.RESUMING ||
      this.status === TRANSPORT_STATUS.PAUSED
    ) {
      // The backend session was closed by the pause, so a drop here loses no audio. Wait for an explicit resume.
      this.transcript = applyDisconnect(this.transcript);
      this.setStatus(TRANSPORT_STATUS.PAUSED);
      return;
    }
    this.transcript = applyDisconnect(this.transcript);
    this.onEvent({ type: 'interrupted' });
    this.scheduleReconnect();
  }

  scheduleReconnect() {
    if (this.timers.reconnect) return;
    if (this.attempts >= this.reconnectDelaysMs.length) {
      this.error = {
        code: 'reconnect_exhausted',
        message: 'SignBridge could not reconnect to transcription. Start listening again.',
        recoverable: false,
      };
      this.onEvent({ type: 'error', code: 'reconnect_exhausted', recoverable: false });
      this.setStatus(TRANSPORT_STATUS.FAILED);
      return;
    }
    const delayMs = this.reconnectDelaysMs[this.attempts];
    this.attempts += 1;
    this.onEvent({ type: 'reconnect_scheduled', attempt: this.attempts, delayMs });
    this.setStatus(TRANSPORT_STATUS.RECONNECTING);
    this.timers.reconnect = setTimeout(() => {
      this.timers.reconnect = null;
      this.open();
    }, delayMs);
  }

  abortSocket(code, message) {
    if (code) {
      this.error = { code, message, recoverable: true };
      this.onEvent({ type: 'error', code, recoverable: true });
    }
    const socket = this.socket;
    socket?.close?.();
  }

  finishStop() {
    for (const key of TIMER_KEYS) this.clearTimer(key);
    this.generation += 1;
    this.queue = [];
    this.transcript = applyDisconnect(this.transcript);
    this.setStatus(TRANSPORT_STATUS.STOPPED);
  }

  startPingTimer() {
    this.clearTimer('ping');
    this.timers.ping = setInterval(() => this.sendPing(), this.timing.pingIntervalMs);
  }

  sendPing() {
    if (this.status !== TRANSPORT_STATUS.LISTENING && this.status !== TRANSPORT_STATUS.PAUSED) return;
    if (!this.socket || this.socket.readyState !== WS_OPEN) return;
    this.send(buildControlMessage('ping'));
    if (!this.timers.pong) {
      this.startTimer('pong', this.timing.pongTimeoutMs, () =>
        this.abortSocket('pong_timeout', 'The transcription connection stopped responding.'),
      );
    }
  }

  flushQueue() {
    const frames = this.queue;
    this.queue = [];
    for (const frame of frames) {
      if (!this.socket || this.socket.readyState !== WS_OPEN) break;
      this.socket.send(frame);
    }
  }

  send(message) {
    if (!this.socket || this.socket.readyState !== WS_OPEN) return false;
    this.socket.send(JSON.stringify(message));
    return true;
  }

  drop(reason) {
    this.recordDrop(reason);
    return false;
  }

  recordDrop(reason) {
    this.droppedFrames += 1;
    this.onEvent({ type: 'audio_dropped', reason, total: this.droppedFrames });
  }

  setStatus(status) {
    if (this.status === status) return;
    this.status = status;
    this.emit();
  }

  emit() {
    if (!this.disposed) this.onChange(this.snapshot());
  }

  startTimer(key, ms, callback) {
    this.clearTimer(key);
    this.timers[key] = setTimeout(() => {
      this.timers[key] = null;
      callback();
    }, ms);
  }

  clearTimer(key) {
    const id = this.timers[key];
    if (id === null || id === undefined) return;
    clearTimeout(id);
    clearInterval(id);
    this.timers[key] = null;
  }
}
