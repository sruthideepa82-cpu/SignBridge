import { PcmEncoder } from './pcm.js';

// Microphone capture for speech transcription. It owns the stream, the AudioContext and the AudioWorklet, and it
// releases all of them on every exit path. Start must be called from a user gesture (a click handler), so the
// permission prompt is always caused by the user.

export const CAPTURE_STATE = {
  IDLE: 'idle',
  REQUESTING: 'requesting',
  CAPTURING: 'capturing',
  STOPPING: 'stopping',
  ERROR: 'error',
};

export const CAPTURE_ERROR = {
  UNSUPPORTED: 'unsupported',
  REQUIRES_GESTURE: 'requires_gesture',
  INSECURE_CONTEXT: 'insecure_context',
  PERMISSION_DENIED: 'permission_denied',
  NO_DEVICE: 'no_device',
  DEVICE_BUSY: 'device_busy',
  DEVICE_LOST: 'device_lost',
  AUDIO_CONTEXT_FAILED: 'audio_context_failed',
  CAPTURE_FAILED: 'capture_failed',
};

export const WORKLET_NAME = 'signbridge-pcm-capture';

// The worklet lives in public/ so Vite copies it unchanged. Bundling would turn it into a data: URL, which addModule()
// cannot reliably load.
export const WORKLET_PATH = 'audio/pcm-worklet.js';

export function defaultWorkletUrl() {
  return `${import.meta.env.BASE_URL}${WORKLET_PATH}`;
}

export const AUDIO_CONSTRAINTS = Object.freeze({
  channelCount: 1,
  echoCancellation: true,
  noiseSuppression: true,
  autoGainControl: true,
});

const DEFAULT_FLUSH_TIMEOUT_MS = 300;

const ERROR_MESSAGES = {
  [CAPTURE_ERROR.UNSUPPORTED]: 'This browser cannot capture microphone audio for transcription. Try a recent version of Chrome or Edge.',
  [CAPTURE_ERROR.REQUIRES_GESTURE]: 'Microphone access must be started by pressing a button.',
  [CAPTURE_ERROR.INSECURE_CONTEXT]: 'The microphone needs a secure page. Open SignBridge over https or on localhost.',
  [CAPTURE_ERROR.PERMISSION_DENIED]: 'Microphone permission was denied. Allow microphone access in your browser settings, then try again.',
  [CAPTURE_ERROR.NO_DEVICE]: 'No microphone was found.',
  [CAPTURE_ERROR.DEVICE_BUSY]: 'The microphone is in use by another application or could not be read.',
  [CAPTURE_ERROR.DEVICE_LOST]: 'The microphone was disconnected. Reconnect it and start again.',
  [CAPTURE_ERROR.AUDIO_CONTEXT_FAILED]: 'The browser could not start the audio pipeline for the microphone.',
  [CAPTURE_ERROR.CAPTURE_FAILED]: 'The microphone could not be started.',
};

// Maps a getUserMedia failure to a code and a message the page can show.
export function describeCaptureError(error) {
  const name = error?.name;
  let code = CAPTURE_ERROR.CAPTURE_FAILED;
  if (name === 'NotAllowedError') code = CAPTURE_ERROR.PERMISSION_DENIED;
  else if (name === 'SecurityError') code = CAPTURE_ERROR.INSECURE_CONTEXT;
  else if (name === 'NotFoundError' || name === 'OverconstrainedError') code = CAPTURE_ERROR.NO_DEVICE;
  else if (name === 'NotReadableError' || name === 'AbortError') code = CAPTURE_ERROR.DEVICE_BUSY;
  return { code, message: ERROR_MESSAGES[code] };
}

export function captureErrorMessage(code) {
  return ERROR_MESSAGES[code] ?? ERROR_MESSAGES[CAPTURE_ERROR.CAPTURE_FAILED];
}

function defaultAudioContextFactory() {
  const Context = globalThis.AudioContext ?? globalThis.webkitAudioContext;
  if (typeof Context !== 'function') throw new Error('AudioContext is not available.');
  return new Context();
}

function stopStream(stream, onEnded) {
  for (const track of stream.getTracks()) {
    if (onEnded) track.removeEventListener?.('ended', onEnded);
    track.stop();
  }
}

export class MicrophoneCapture {
  constructor({
    onFrame = () => {},
    onStateChange = () => {},
    onError = () => {},
    mediaDevices = globalThis.navigator?.mediaDevices,
    createAudioContext = defaultAudioContextFactory,
    workletUrl = defaultWorkletUrl(),
    flushTimeoutMs = DEFAULT_FLUSH_TIMEOUT_MS,
  } = {}) {
    this.onFrame = onFrame;
    this.onStateChange = onStateChange;
    this.onError = onError;
    this.mediaDevices = mediaDevices;
    this.createAudioContext = createAudioContext;
    this.workletUrl = workletUrl;
    this.flushTimeoutMs = flushTimeoutMs;
    this.state = CAPTURE_STATE.IDLE;
    this.requestId = 0;
    this.stream = null;
    this.context = null;
    this.source = null;
    this.node = null;
    this.mute = null;
    this.encoder = null;
    this.paused = false;
    this.flushResolve = null;
    this.onTrackEnded = () => this.fail(CAPTURE_ERROR.DEVICE_LOST);
  }

  get sampleRate() {
    return this.context?.sampleRate ?? null;
  }

  async start() {
    if (this.state === CAPTURE_STATE.REQUESTING || this.state === CAPTURE_STATE.CAPTURING) return;
    if (!this.mediaDevices?.getUserMedia) {
      this.fail(CAPTURE_ERROR.UNSUPPORTED);
      return;
    }
    const activation = globalThis.navigator?.userActivation;
    if (activation && !activation.isActive) {
      this.fail(CAPTURE_ERROR.REQUIRES_GESTURE);
      return;
    }

    const id = ++this.requestId;
    this.setState(CAPTURE_STATE.REQUESTING);

    let stream;
    try {
      stream = await this.mediaDevices.getUserMedia({ audio: { ...AUDIO_CONSTRAINTS } });
    } catch (error) {
      if (id !== this.requestId) return;
      this.fail(describeCaptureError(error).code);
      return;
    }
    // The page may have unmounted or stopped while the permission prompt was open. Then the stream is not used.
    if (id !== this.requestId) {
      stopStream(stream);
      return;
    }

    const track = stream.getAudioTracks()[0];
    if (!track) {
      stopStream(stream);
      this.fail(CAPTURE_ERROR.NO_DEVICE);
      return;
    }
    this.stream = stream;
    track.addEventListener('ended', this.onTrackEnded);

    try {
      this.context = this.createAudioContext();
    } catch {
      this.fail(CAPTURE_ERROR.AUDIO_CONTEXT_FAILED);
      return;
    }
    // No ScriptProcessor fallback: it runs on the main thread and would make the capture path depend on page load.
    // Callers can use the browser speech recognition fallback instead.
    if (!this.context.audioWorklet || typeof globalThis.AudioWorkletNode !== 'function') {
      this.fail(CAPTURE_ERROR.UNSUPPORTED);
      return;
    }

    try {
      await this.context.audioWorklet.addModule(this.workletUrl);
      if (this.context.state === 'suspended') await this.context.resume();
    } catch {
      if (id === this.requestId) this.fail(CAPTURE_ERROR.AUDIO_CONTEXT_FAILED);
      return;
    }
    if (id !== this.requestId) {
      this.release();
      return;
    }

    const context = this.context;
    this.source = context.createMediaStreamSource(stream);
    this.node = new globalThis.AudioWorkletNode(context, WORKLET_NAME, {
      numberOfInputs: 1,
      numberOfOutputs: 1,
      outputChannelCount: [1],
      channelCount: 1,
      channelCountMode: 'explicit',
      channelInterpretation: 'speakers',
    });
    // The worklet must be connected to the destination to run. A zero-gain node keeps the microphone out of the speakers.
    this.mute = context.createGain();
    this.mute.gain.value = 0;
    this.source.connect(this.node);
    this.node.connect(this.mute);
    this.mute.connect(context.destination);
    this.node.port.onmessage = (event) => this.onWorkletMessage(event.data);

    this.encoder = new PcmEncoder(context.sampleRate);
    this.setState(CAPTURE_STATE.CAPTURING);
  }

  onWorkletMessage(data) {
    if (data instanceof Float32Array) {
      if (this.paused || !this.encoder) return;
      this.emit(this.encoder.push(data));
    } else if (data?.type === 'flushed') {
      this.flushResolve?.();
    }
  }

  emit(frames) {
    for (const frame of frames) this.onFrame(frame);
  }

  // Pausing keeps the permission and the stream, but stops samples from producing frames. Resuming starts a new
  // encoder so an old partial frame is not joined to new speech.
  pause() {
    if (this.state !== CAPTURE_STATE.CAPTURING || this.paused) return;
    this.paused = true;
    this.setTrackEnabled(false);
  }

  resume() {
    if (this.state !== CAPTURE_STATE.CAPTURING || !this.paused) return;
    this.paused = false;
    this.encoder = new PcmEncoder(this.context.sampleRate);
    this.setTrackEnabled(true);
  }

  setTrackEnabled(enabled) {
    for (const track of this.stream?.getAudioTracks() ?? []) track.enabled = enabled;
  }

  // Turns the microphone off at once, then sends the samples still buffered in the worklet, so the last words are not
  // lost. Frames are delivered through onFrame before stop() resolves.
  async stop() {
    if (this.state === CAPTURE_STATE.REQUESTING) {
      this.dispose();
      return;
    }
    if (this.state !== CAPTURE_STATE.CAPTURING) {
      this.release();
      return;
    }
    this.setState(CAPTURE_STATE.STOPPING);
    this.stopTracks();
    await this.flushTail();
    this.release();
    this.setState(CAPTURE_STATE.IDLE);
  }

  async flushTail() {
    if (!this.node || !this.encoder || this.paused) return;
    const flushed = new Promise((resolve) => {
      this.flushResolve = resolve;
    });
    const timeout = new Promise((resolve) => setTimeout(resolve, this.flushTimeoutMs));
    this.node.port.postMessage('flush');
    await Promise.race([flushed, timeout]);
    this.flushResolve = null;
    if (this.encoder) this.emit(this.encoder.flush());
  }

  // For unmounting. Pending permission requests are cancelled, and the stream is released at once.
  dispose() {
    this.requestId += 1;
    this.release();
    this.setState(CAPTURE_STATE.IDLE);
  }

  fail(code) {
    this.release();
    this.setState(CAPTURE_STATE.ERROR);
    this.onError({ code, message: captureErrorMessage(code) });
  }

  stopTracks() {
    if (!this.stream) return;
    stopStream(this.stream, this.onTrackEnded);
    this.stream = null;
  }

  // Safe to call more than once. Each resource is cleared before it is released, so a second call does nothing.
  release() {
    this.stopTracks();
    if (this.node) {
      this.node.port.onmessage = null;
      this.node.disconnect?.();
      this.node = null;
    }
    this.source?.disconnect?.();
    this.source = null;
    this.mute?.disconnect?.();
    this.mute = null;
    if (this.context) {
      const context = this.context;
      this.context = null;
      try {
        const closing = context.close?.();
        closing?.catch?.(() => {});
      } catch {
        // The context is already closed or closing.
      }
    }
    this.encoder = null;
    this.paused = false;
    this.flushResolve = null;
  }

  setState(state) {
    if (this.state === state) return;
    this.state = state;
    this.onStateChange(state);
  }
}
