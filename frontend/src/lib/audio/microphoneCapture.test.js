import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import {
  AUDIO_CONSTRAINTS,
  CAPTURE_ERROR,
  CAPTURE_STATE,
  MicrophoneCapture,
  WORKLET_NAME,
  WORKLET_PATH,
  defaultWorkletUrl,
  describeCaptureError,
} from './microphoneCapture.js';
import { FRAME_BYTES } from './pcm.js';

function makeTrack() {
  const listeners = new Map();
  return {
    kind: 'audio',
    enabled: true,
    stopped: false,
    stop: vi.fn(function stop() {
      this.stopped = true;
    }),
    addEventListener: vi.fn((type, fn) => listeners.set(type, fn)),
    removeEventListener: vi.fn((type) => listeners.delete(type)),
    fireEnded() {
      listeners.get('ended')?.();
    },
    listenerCount: () => listeners.size,
  };
}

function makeStream(tracks = [makeTrack()]) {
  return {
    tracks,
    getAudioTracks: () => tracks,
    getTracks: () => tracks,
  };
}

function makeContext({ sampleRate = 44100, worklet = true } = {}) {
  const context = {
    sampleRate,
    state: 'running',
    destination: { name: 'destination' },
    audioWorklet: worklet ? { addModule: vi.fn(async () => {}) } : undefined,
    createMediaStreamSource: vi.fn(() => ({ connect: vi.fn(), disconnect: vi.fn() })),
    createGain: vi.fn(() => ({ gain: { value: 1 }, connect: vi.fn(), disconnect: vi.fn() })),
    close: vi.fn(async () => {}),
    resume: vi.fn(async () => {}),
  };
  return context;
}

class FakeWorkletNode {
  static instances = [];

  constructor(context, name, options) {
    this.context = context;
    this.name = name;
    this.options = options;
    this.port = {
      onmessage: null,
      postMessage: vi.fn((message) => {
        if (message === 'flush') this.port.onmessage?.({ data: { type: 'flushed' } });
      }),
    };
    this.connect = vi.fn();
    this.disconnect = vi.fn();
    FakeWorkletNode.instances.push(this);
  }

  // Simulates a batch of device samples arriving from the audio thread.
  deliver(samples) {
    this.port.onmessage?.({ data: samples });
  }
}

function deferred() {
  let resolve;
  let reject;
  const promise = new Promise((res, rej) => {
    resolve = res;
    reject = rej;
  });
  return { promise, resolve, reject };
}

function setup(overrides = {}) {
  const track = makeTrack();
  const stream = makeStream([track]);
  const context = makeContext(overrides.context);
  const mediaDevices = {
    getUserMedia: vi.fn(async () => stream),
    ...overrides.mediaDevices,
  };
  const frames = [];
  const states = [];
  const errors = [];
  const capture = new MicrophoneCapture({
    mediaDevices,
    createAudioContext: overrides.createAudioContext ?? (() => context),
    workletUrl: 'pcm-worklet-test.js',
    flushTimeoutMs: 50,
    onFrame: (frame) => frames.push(frame),
    onStateChange: (state) => states.push(state),
    onError: (error) => errors.push(error),
  });
  return { capture, track, stream, context, mediaDevices, frames, states, errors };
}

beforeEach(() => {
  FakeWorkletNode.instances = [];
  vi.stubGlobal('AudioWorkletNode', FakeWorkletNode);
});

afterEach(() => {
  vi.unstubAllGlobals();
  vi.restoreAllMocks();
});

describe('worklet asset', () => {
  it('is loaded from a stable public URL that is not inlined by the bundler', () => {
    expect(defaultWorkletUrl()).toBe(`${import.meta.env.BASE_URL}audio/pcm-worklet.js`);
  });

  it('exists as one public file that registers the processor name the capture code uses', () => {
    const file = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../../public', WORKLET_PATH);
    const source = readFileSync(file, 'utf8');

    expect(source).toContain(`registerProcessor('${WORKLET_NAME}'`);
  });

  it('keeps no second copy of the worklet in src', () => {
    const srcCopy = path.resolve(path.dirname(fileURLToPath(import.meta.url)), 'pcm-worklet.js');

    expect(existsSync(srcCopy)).toBe(false);
  });
});

describe('MicrophoneCapture start', () => {
  it('requests mono audio with echo cancellation, noise suppression and gain control', async () => {
    const { capture, mediaDevices } = setup();

    await capture.start();

    expect(mediaDevices.getUserMedia).toHaveBeenCalledWith({ audio: AUDIO_CONSTRAINTS });
    expect(AUDIO_CONSTRAINTS).toMatchObject({
      channelCount: 1,
      echoCancellation: true,
      noiseSuppression: true,
      autoGainControl: true,
    });
    expect(capture.state).toBe(CAPTURE_STATE.CAPTURING);
  });

  it('uses the browser\'s real sample rate rather than assuming 16 kHz', async () => {
    const { capture, context } = setup({ context: { sampleRate: 44100 } });

    await capture.start();

    expect(capture.sampleRate).toBe(44100);
    expect(context.audioWorklet.addModule).toHaveBeenCalledWith('pcm-worklet-test.js');
    expect(FakeWorkletNode.instances[0].name).toBe(WORKLET_NAME);
    expect(FakeWorkletNode.instances[0].options).toMatchObject({ channelCount: 1, channelCountMode: 'explicit' });
  });

  it('keeps the microphone out of the speakers by routing the worklet through a silent gain node', async () => {
    const { capture, context } = setup();

    await capture.start();

    const gain = context.createGain.mock.results[0].value;
    expect(gain.gain.value).toBe(0);
    expect(FakeWorkletNode.instances[0].connect).toHaveBeenCalledWith(gain);
    expect(gain.connect).toHaveBeenCalledWith(context.destination);
  });

  it('emits 3,200-byte frames converted from the device rate', async () => {
    const { capture, frames } = setup({ context: { sampleRate: 48000 } });
    await capture.start();
    const node = FakeWorkletNode.instances[0];

    for (let i = 0; i < 10; i += 1) node.deliver(new Float32Array(4800).fill(0.25));
    await capture.stop();

    expect(frames.length).toBeGreaterThan(0);
    expect(frames.every((frame) => frame.byteLength === FRAME_BYTES)).toBe(true);
    expect(frames.reduce((sum, frame) => sum + frame.byteLength, 0)).toBe(32000);
  });

  it('does not start a second capture while one is running', async () => {
    const { capture, mediaDevices } = setup();

    await capture.start();
    await capture.start();

    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
  });

  it('refuses to start from a background event when the page has no user activation', async () => {
    Object.defineProperty(globalThis.navigator, 'userActivation', { value: { isActive: false }, configurable: true });
    const { capture, mediaDevices, errors } = setup();

    try {
      await capture.start();
    } finally {
      delete globalThis.navigator.userActivation;
    }

    expect(mediaDevices.getUserMedia).not.toHaveBeenCalled();
    expect(errors[0].code).toBe(CAPTURE_ERROR.REQUIRES_GESTURE);
  });
});

describe('MicrophoneCapture permission and device errors', () => {
  it.each([
    ['NotAllowedError', CAPTURE_ERROR.PERMISSION_DENIED],
    ['SecurityError', CAPTURE_ERROR.INSECURE_CONTEXT],
    ['NotFoundError', CAPTURE_ERROR.NO_DEVICE],
    ['OverconstrainedError', CAPTURE_ERROR.NO_DEVICE],
    ['NotReadableError', CAPTURE_ERROR.DEVICE_BUSY],
    ['SomethingElse', CAPTURE_ERROR.CAPTURE_FAILED],
  ])('maps %s to %s and creates no audio pipeline', async (name, code) => {
    const { capture, context, errors, mediaDevices } = setup({
      mediaDevices: { getUserMedia: vi.fn(async () => Promise.reject(Object.assign(new Error('x'), { name }))) },
    });

    await capture.start();

    expect(mediaDevices.getUserMedia).toHaveBeenCalledTimes(1);
    expect(errors).toHaveLength(1);
    expect(errors[0].code).toBe(code);
    expect(errors[0].message.length).toBeGreaterThan(0);
    expect(capture.state).toBe(CAPTURE_STATE.ERROR);
    expect(context.createMediaStreamSource).not.toHaveBeenCalled();
  });

  it('reports an unsupported browser when getUserMedia is missing', async () => {
    const { capture, errors } = setup({ mediaDevices: { getUserMedia: undefined } });

    await capture.start();

    expect(errors[0].code).toBe(CAPTURE_ERROR.UNSUPPORTED);
  });

  it('reports no device when the stream has no audio track', async () => {
    const { capture, errors, mediaDevices } = setup({
      mediaDevices: { getUserMedia: vi.fn(async () => makeStream([])) },
    });

    await capture.start();

    expect(errors[0].code).toBe(CAPTURE_ERROR.NO_DEVICE);
    expect(mediaDevices.getUserMedia).toHaveBeenCalled();
  });

  it('reports an unsupported browser and releases the microphone when AudioWorklet is missing', async () => {
    const { capture, track, context, errors } = setup({ context: { worklet: false } });

    await capture.start();

    expect(errors[0].code).toBe(CAPTURE_ERROR.UNSUPPORTED);
    expect(track.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('reports an audio pipeline failure when the context cannot be created', async () => {
    const { capture, track, errors } = setup({
      createAudioContext: () => {
        throw new Error('no audio');
      },
    });

    await capture.start();

    expect(errors[0].code).toBe(CAPTURE_ERROR.AUDIO_CONTEXT_FAILED);
    expect(track.stop).toHaveBeenCalled();
  });

  it('reports an audio pipeline failure when the worklet module fails to load, and frees everything', async () => {
    const context = makeContext();
    context.audioWorklet.addModule = vi.fn(async () => {
      throw new Error('network');
    });
    const { capture, track, errors } = setup({ context: {} , createAudioContext: () => context });

    await capture.start();

    expect(errors[0].code).toBe(CAPTURE_ERROR.AUDIO_CONTEXT_FAILED);
    expect(track.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('describes known DOMException names with a message for the page', () => {
    const error = describeCaptureError({ name: 'NotAllowedError' });

    expect(error.code).toBe(CAPTURE_ERROR.PERMISSION_DENIED);
    expect(error.message).toMatch(/permission/i);
  });
});

describe('MicrophoneCapture cleanup', () => {
  it('stops every track, disconnects the graph and closes the context on stop', async () => {
    const { capture, track, context } = setup();
    await capture.start();
    const node = FakeWorkletNode.instances[0];

    await capture.stop();

    expect(track.stop).toHaveBeenCalled();
    expect(node.disconnect).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(capture.state).toBe(CAPTURE_STATE.IDLE);
    expect(capture.context).toBeNull();
  });

  it('is safe to call stop and release more than once', async () => {
    const { capture, context } = setup();
    await capture.start();

    await capture.stop();
    await capture.stop();
    capture.release();
    capture.dispose();

    expect(context.close).toHaveBeenCalledTimes(1);
  });

  it('delivers buffered samples before releasing the microphone, so the last words are kept', async () => {
    const { capture, track, frames } = setup({ context: { sampleRate: 16000 } });
    await capture.start();
    const node = FakeWorkletNode.instances[0];
    node.deliver(new Float32Array(1000).fill(0.1));

    await capture.stop();

    const totalBytes = frames.reduce((sum, frame) => sum + frame.byteLength, 0);
    expect(totalBytes).toBe(2000);
    expect(node.port.postMessage).toHaveBeenCalledWith('flush');
    expect(track.stop).toHaveBeenCalled();
  });

  it('stops the microphone at once on stop, even before the tail is delivered', async () => {
    const { capture, track } = setup();
    await capture.start();
    const trackStopsBeforeFlush = [];
    FakeWorkletNode.instances[0].port.postMessage = vi.fn((message) => {
      if (message === 'flush') {
        trackStopsBeforeFlush.push(track.stopped);
        FakeWorkletNode.instances[0].port.onmessage?.({ data: { type: 'flushed' } });
      }
    });

    await capture.stop();

    expect(trackStopsBeforeFlush).toEqual([true]);
  });

  it('releases the microphone when the device is unplugged', async () => {
    const { capture, track, context, errors } = setup();
    await capture.start();

    track.fireEnded();

    expect(errors[0].code).toBe(CAPTURE_ERROR.DEVICE_LOST);
    expect(track.stop).toHaveBeenCalled();
    expect(context.close).toHaveBeenCalledTimes(1);
    expect(capture.state).toBe(CAPTURE_STATE.ERROR);
  });

  it('removes its track listener when released', async () => {
    const { capture, track } = setup();
    await capture.start();

    await capture.stop();

    expect(track.removeEventListener).toHaveBeenCalledWith('ended', expect.any(Function));
    expect(track.listenerCount()).toBe(0);
  });

  it('frees a microphone granted after the page stopped waiting for it', async () => {
    const request = deferred();
    const track = makeTrack();
    const stream = makeStream([track]);
    const context = makeContext();
    const { capture, frames, errors } = setup({
      mediaDevices: { getUserMedia: vi.fn(() => request.promise) },
      createAudioContext: () => context,
    });

    const starting = capture.start();
    capture.dispose();
    request.resolve(stream);
    await starting;

    expect(track.stop).toHaveBeenCalled();
    expect(context.createMediaStreamSource).not.toHaveBeenCalled();
    expect(capture.state).toBe(CAPTURE_STATE.IDLE);
    expect(frames).toHaveLength(0);
    expect(errors).toHaveLength(0);
  });

  it('ignores a permission error that arrives after the page stopped waiting', async () => {
    const request = deferred();
    const { capture, errors } = setup({ mediaDevices: { getUserMedia: vi.fn(() => request.promise) } });

    const starting = capture.start();
    capture.dispose();
    request.reject(Object.assign(new Error('x'), { name: 'NotAllowedError' }));
    await starting;

    expect(errors).toHaveLength(0);
    expect(capture.state).toBe(CAPTURE_STATE.IDLE);
  });

  it('stops a pending capture when stop is called during the permission prompt', async () => {
    const request = deferred();
    const track = makeTrack();
    const { capture } = setup({ mediaDevices: { getUserMedia: vi.fn(() => request.promise) } });

    const starting = capture.start();
    await capture.stop();
    request.resolve(makeStream([track]));
    await starting;

    expect(track.stop).toHaveBeenCalled();
    expect(capture.state).toBe(CAPTURE_STATE.IDLE);
  });
});

describe('MicrophoneCapture pause and resume', () => {
  it('stops producing frames while paused and disables the track', async () => {
    const { capture, track, frames } = setup({ context: { sampleRate: 16000 } });
    await capture.start();
    const node = FakeWorkletNode.instances[0];

    capture.pause();
    node.deliver(new Float32Array(3200).fill(0.3));

    expect(frames).toHaveLength(0);
    expect(track.enabled).toBe(false);
  });

  it('starts a fresh encoder on resume, so no partial frame from before the pause is joined to new speech', async () => {
    const { capture, track, frames } = setup({ context: { sampleRate: 16000 } });
    await capture.start();
    const node = FakeWorkletNode.instances[0];
    node.deliver(new Float32Array(1000).fill(0.9));

    capture.pause();
    capture.resume();
    node.deliver(new Float32Array(1600).fill(0.1));

    expect(track.enabled).toBe(true);
    expect(frames).toHaveLength(1);
    const firstSample = new DataView(frames[0]).getInt16(0, true);
    expect(firstSample).toBeCloseTo(0.1 * 32767, -1);
  });
});
