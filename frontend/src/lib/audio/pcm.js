// PCM conversion for Gemini Live: 16 kHz, mono, signed 16-bit little-endian. Everything here is pure so it can be
// tested without a browser. Browser audio arrives at the device's own rate (often 48 kHz), so it is resampled here.

export const TARGET_SAMPLE_RATE = 16000;
export const FRAME_MS = 100;
export const FRAME_SAMPLES = (TARGET_SAMPLE_RATE * FRAME_MS) / 1000;
export const FRAME_BYTES = FRAME_SAMPLES * 2;

// Windowed-sinc low-pass filter. Each side of an output sample uses HALF_WIDTH input samples. The filter is precomputed
// for PHASES fractional offsets, so each output sample costs one dot product.
const HALF_WIDTH = 64;
const TAPS = HALF_WIDTH * 2 + 1;
const PHASES = 256;
// Stays below the 8 kHz Nyquist limit of the 16 kHz target, so content above it is removed before decimation.
const CUTOFF_FRACTION = 0.45;

const kernelCache = new Map();

function buildKernel(inputRate, outputRate) {
  const key = `${inputRate}:${outputRate}`;
  const cached = kernelCache.get(key);
  if (cached) return cached;

  const cutoff = (CUTOFF_FRACTION * Math.min(inputRate, outputRate)) / inputRate;
  const table = new Float32Array(PHASES * TAPS);
  const L = HALF_WIDTH + 1;
  for (let phase = 0; phase < PHASES; phase += 1) {
    const fraction = phase / PHASES;
    let sum = 0;
    for (let tap = 0; tap < TAPS; tap += 1) {
      const distance = tap - HALF_WIDTH - fraction;
      const x = 2 * cutoff * distance;
      const sinc = Math.abs(x) < 1e-9 ? 1 : Math.sin(Math.PI * x) / (Math.PI * x);
      const window = Math.abs(distance) < L
        ? 0.42 + 0.5 * Math.cos((Math.PI * distance) / L) + 0.08 * Math.cos((2 * Math.PI * distance) / L)
        : 0;
      const value = 2 * cutoff * sinc * window;
      table[phase * TAPS + tap] = value;
      sum += value;
    }
    // Normalising each phase gives unity gain at 0 Hz, so speech level is not changed by the filter.
    for (let tap = 0; tap < TAPS; tap += 1) table[phase * TAPS + tap] /= sum;
  }
  kernelCache.set(key, table);
  return table;
}

function assertPositiveInteger(value, name) {
  if (!Number.isInteger(value) || value <= 0) {
    throw new RangeError(`${name} must be a positive integer, got ${value}.`);
  }
}

// Streaming resampler. Input can arrive in chunks of any size. The result is the same as processing it all at once.
export class PcmResampler {
  constructor(inputRate, outputRate = TARGET_SAMPLE_RATE) {
    assertPositiveInteger(inputRate, 'inputRate');
    assertPositiveInteger(outputRate, 'outputRate');
    this.inputRate = inputRate;
    this.outputRate = outputRate;
    this.passthrough = inputRate === outputRate;
    this.kernel = this.passthrough ? null : buildKernel(inputRate, outputRate);
    this.received = 0;
    this.history = new Float32Array(0);
    this.historyStart = 0;
    this.nextOutput = 0;
  }

  process(input) {
    this.received += input.length;
    if (this.passthrough) return input.slice();
    this.append(input);
    return this.drain();
  }

  // Ends the stream. Silence is added so the last output samples have full filter support. No real audio is added.
  flush() {
    if (this.passthrough) return new Float32Array(0);
    this.append(new Float32Array(HALF_WIDTH + 1));
    return this.drain();
  }

  append(samples) {
    const merged = new Float32Array(this.history.length + samples.length);
    merged.set(this.history, 0);
    merged.set(samples, this.history.length);
    this.history = merged;
  }

  drain() {
    const { inputRate, outputRate, kernel } = this;
    const available = this.historyStart + this.history.length;
    const result = new Float32Array(Math.ceil((this.history.length * outputRate) / inputRate) + 1);
    let written = 0;
    let k = this.nextOutput;
    for (;;) {
      // Integer arithmetic keeps output positions exact over long sessions.
      const position = k * inputRate;
      if (position >= this.received * outputRate) break;
      const n0 = Math.floor(position / outputRate);
      if (n0 + HALF_WIDTH >= available) break;
      const phase = Math.floor(((position % outputRate) * PHASES) / outputRate);
      const base = phase * TAPS;
      let sum = 0;
      for (let tap = 0; tap < TAPS; tap += 1) {
        const index = n0 + tap - HALF_WIDTH - this.historyStart;
        if (index >= 0) sum += kernel[base + tap] * this.history[index];
      }
      result[written] = sum;
      written += 1;
      k += 1;
    }
    this.nextOutput = k;

    // Keep only the input the next output needs.
    const keepFrom = Math.floor((k * inputRate) / outputRate) - HALF_WIDTH;
    const drop = Math.min(keepFrom - this.historyStart, this.history.length);
    if (drop > 0) {
      this.history = this.history.slice(drop);
      this.historyStart += drop;
    }
    return result.slice(0, written);
  }
}

// Float32 samples in [-1, 1] to signed 16-bit. Values outside the range are clamped. NaN becomes silence.
export function floatToInt16(samples, out = new Int16Array(samples.length)) {
  for (let i = 0; i < samples.length; i += 1) {
    let value = samples[i];
    if (!Number.isFinite(value)) value = 0;
    if (value > 1) value = 1;
    else if (value < -1) value = -1;
    out[i] = value < 0 ? Math.round(value * 32768) : Math.round(value * 32767);
  }
  return out;
}

// Little-endian bytes, whatever the platform byte order is.
export function encodeLittleEndian(samples) {
  const buffer = new ArrayBuffer(samples.length * 2);
  const view = new DataView(buffer);
  for (let i = 0; i < samples.length; i += 1) {
    view.setInt16(i * 2, samples[i], true);
  }
  return buffer;
}

// Collects samples into fixed-size frames. A partial frame waits for more samples until flush() is called.
export class PcmFrameBuffer {
  constructor(frameSamples = FRAME_SAMPLES) {
    this.frameSamples = frameSamples;
    this.current = new Int16Array(frameSamples);
    this.filled = 0;
  }

  push(samples) {
    const frames = [];
    let offset = 0;
    while (offset < samples.length) {
      const count = Math.min(this.frameSamples - this.filled, samples.length - offset);
      this.current.set(samples.subarray(offset, offset + count), this.filled);
      this.filled += count;
      offset += count;
      if (this.filled === this.frameSamples) {
        frames.push(encodeLittleEndian(this.current));
        this.filled = 0;
      }
    }
    return frames;
  }

  flush() {
    if (this.filled === 0) return null;
    const frame = encodeLittleEndian(this.current.subarray(0, this.filled));
    this.filled = 0;
    return frame;
  }
}

// One object per capture: device-rate Float32 in, 100 ms PCM frames out.
export class PcmEncoder {
  constructor(inputRate, outputRate = TARGET_SAMPLE_RATE) {
    this.resampler = new PcmResampler(inputRate, outputRate);
    this.frames = new PcmFrameBuffer();
  }

  push(samples) {
    return this.frames.push(floatToInt16(this.resampler.process(samples)));
  }

  flush() {
    const frames = this.frames.push(floatToInt16(this.resampler.flush()));
    const tail = this.frames.flush();
    if (tail) frames.push(tail);
    return frames;
  }
}
