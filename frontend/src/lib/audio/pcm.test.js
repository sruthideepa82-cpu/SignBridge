import { describe, expect, it } from 'vitest';
import {
  FRAME_BYTES,
  FRAME_SAMPLES,
  PcmEncoder,
  PcmFrameBuffer,
  PcmResampler,
  TARGET_SAMPLE_RATE,
  encodeLittleEndian,
  floatToInt16,
} from './pcm.js';

function sine(frequency, sampleRate, count, amplitude = 1) {
  const out = new Float32Array(count);
  for (let i = 0; i < count; i += 1) {
    out[i] = amplitude * Math.sin((2 * Math.PI * frequency * i) / sampleRate);
  }
  return out;
}

// Peak level of the steady middle of a signal. The start and end are skipped because the filter settles there.
function steadyPeak(samples) {
  let max = 0;
  for (let i = 2000; i < samples.length - 2000; i += 1) max = Math.max(max, Math.abs(samples[i]));
  return max;
}

function concat(parts) {
  const total = parts.reduce((sum, part) => sum + part.length, 0);
  const out = new Float32Array(total);
  let offset = 0;
  for (const part of parts) {
    out.set(part, offset);
    offset += part.length;
  }
  return out;
}

function readInt16LE(buffer) {
  const view = new DataView(buffer);
  const values = [];
  for (let offset = 0; offset < buffer.byteLength; offset += 2) values.push(view.getInt16(offset, true));
  return values;
}

describe('floatToInt16', () => {
  it('maps the full range to signed 16-bit values', () => {
    expect(Array.from(floatToInt16(Float32Array.of(0, 1, -1, 0.5, -0.5)))).toEqual([0, 32767, -32768, 16384, -16384]);
  });

  it('clamps values outside the range instead of wrapping', () => {
    expect(Array.from(floatToInt16(Float32Array.of(2, -3, 1.0000001)))).toEqual([32767, -32768, 32767]);
  });

  it('turns NaN and infinity into silence or the nearest limit', () => {
    expect(Array.from(floatToInt16(Float32Array.of(NaN, Infinity, -Infinity)))).toEqual([0, 0, 0]);
  });
});

describe('encodeLittleEndian', () => {
  it('writes the low byte first regardless of the platform', () => {
    const bytes = new Uint8Array(encodeLittleEndian(Int16Array.of(0x1234, -2)));

    expect(Array.from(bytes)).toEqual([0x34, 0x12, 0xfe, 0xff]);
  });

  it('round-trips every 16-bit value', () => {
    const values = Int16Array.from([-32768, -1, 0, 1, 32767]);

    expect(readInt16LE(encodeLittleEndian(values))).toEqual(Array.from(values));
  });
});

describe('PcmResampler', () => {
  it('passes audio through unchanged when the rate is already 16 kHz', () => {
    const resampler = new PcmResampler(16000);
    const input = sine(440, 16000, 500);

    expect(Array.from(resampler.process(input))).toEqual(Array.from(input));
    expect(resampler.flush().length).toBe(0);
  });

  it('produces exactly one 16 kHz sample per 3 input samples at 48 kHz', () => {
    const resampler = new PcmResampler(48000);
    const outputs = [resampler.process(sine(440, 48000, 48000)), resampler.flush()];

    expect(outputs[0].length + outputs[1].length).toBe(16000);
  });

  it('produces the right sample count at 44.1 kHz', () => {
    const resampler = new PcmResampler(44100);
    const total = resampler.process(sine(440, 44100, 44100)).length + resampler.flush().length;

    expect(total).toBe(16000);
  });

  it('keeps a 1 kHz tone at its original level', () => {
    const resampler = new PcmResampler(48000);
    const output = concat([resampler.process(sine(1000, 48000, 48000)), resampler.flush()]);

    expect(steadyPeak(output)).toBeGreaterThan(0.99);
    expect(steadyPeak(output)).toBeLessThan(1.01);
  });

  it('removes a 12 kHz tone, which would alias into the 16 kHz band without a low-pass filter', () => {
    const resampler = new PcmResampler(48000);
    const output = concat([resampler.process(sine(12000, 48000, 48000)), resampler.flush()]);

    expect(steadyPeak(output)).toBeLessThan(0.02);
  });

  it('has unity gain at 0 Hz', () => {
    const resampler = new PcmResampler(48000);
    const output = concat([resampler.process(new Float32Array(9600).fill(0.5)), resampler.flush()]);

    expect(output[1000]).toBeCloseTo(0.5, 4);
  });

  it('gives the same result however the input is split into chunks', () => {
    const signal = concat([sine(300, 48000, 4000, 0.6), sine(3500, 48000, 4000, 0.3)]);

    const oneShot = new PcmResampler(48000);
    const expected = concat([oneShot.process(signal), oneShot.flush()]);

    for (const size of [1, 7, 128, 500, 2048]) {
      const chunked = new PcmResampler(48000);
      const parts = [];
      for (let offset = 0; offset < signal.length; offset += size) {
        parts.push(chunked.process(signal.subarray(offset, offset + size)));
      }
      parts.push(chunked.flush());
      const actual = concat(parts);

      expect(actual.length).toBe(expected.length);
      for (let i = 0; i < expected.length; i += 1) {
        if (Math.abs(actual[i] - expected[i]) > 1e-6) {
          throw new Error(`chunk size ${size} differs at sample ${i}`);
        }
      }
    }
  });

  it('rejects rates that are not positive whole numbers', () => {
    expect(() => new PcmResampler(0)).toThrow(RangeError);
    expect(() => new PcmResampler(44100.5)).toThrow(RangeError);
    expect(() => new PcmResampler(48000, -16000)).toThrow(RangeError);
  });
});

describe('PcmFrameBuffer', () => {
  it('emits frames of exactly 1,600 samples and keeps the remainder', () => {
    const buffer = new PcmFrameBuffer();
    const frames = buffer.push(new Int16Array(FRAME_SAMPLES + 100));

    expect(frames).toHaveLength(1);
    expect(frames[0].byteLength).toBe(FRAME_BYTES);
    expect(buffer.filled).toBe(100);
  });

  it('joins partial pushes into complete frames without losing or reordering samples', () => {
    const buffer = new PcmFrameBuffer();
    const source = Int16Array.from({ length: FRAME_SAMPLES * 2 }, (_, i) => (i % 30000) - 15000);
    const frames = [];
    for (let offset = 0; offset < source.length; offset += 333) {
      frames.push(...buffer.push(source.subarray(offset, offset + 333)));
    }

    expect(frames).toHaveLength(2);
    expect(readInt16LE(frames[0])).toEqual(Array.from(source.subarray(0, FRAME_SAMPLES)));
    expect(readInt16LE(frames[1])).toEqual(Array.from(source.subarray(FRAME_SAMPLES)));
  });

  it('flushes a partial frame as its own frame, and returns null when nothing is waiting', () => {
    const buffer = new PcmFrameBuffer();
    buffer.push(Int16Array.of(1, 2, 3));

    const tail = buffer.flush();

    expect(tail.byteLength).toBe(6);
    expect(readInt16LE(tail)).toEqual([1, 2, 3]);
    expect(buffer.flush()).toBeNull();
  });
});

describe('PcmEncoder', () => {
  it('produces 3,200-byte frames for one second of 48 kHz audio, with no empty or odd frames', () => {
    const encoder = new PcmEncoder(48000);
    const frames = [...encoder.push(sine(440, 48000, 48000)), ...encoder.flush()];

    const totalBytes = frames.reduce((sum, frame) => sum + frame.byteLength, 0);
    expect(totalBytes).toBe(32000);
    expect(frames.every((frame) => frame.byteLength === FRAME_BYTES)).toBe(true);
  });

  it('gives the same bytes whatever chunk sizes the device delivers', () => {
    const signal = sine(700, 44100, 30000, 0.8);
    const encodeInChunks = (size) => {
      const encoder = new PcmEncoder(44100);
      const frames = [];
      for (let offset = 0; offset < signal.length; offset += size) {
        frames.push(...encoder.push(signal.subarray(offset, offset + size)));
      }
      frames.push(...encoder.flush());
      return frames.flatMap((frame) => Array.from(new Uint8Array(frame)));
    };

    expect(encodeInChunks(128)).toEqual(encodeInChunks(4096));
  });

  it('exposes the 16 kHz target and the 100 ms frame size', () => {
    expect(TARGET_SAMPLE_RATE).toBe(16000);
    expect(FRAME_BYTES).toBe(3200);
  });
});
