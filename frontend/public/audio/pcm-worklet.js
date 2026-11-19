// AudioWorklet that runs on the audio thread. It collects device-rate samples and posts them in batches, so the main
// thread gets a few large messages per second instead of one per 128-sample block. Resampling and PCM conversion are
// in pcm.js. Main thread messages: 'flush' asks for any buffered samples, followed by a { type: 'flushed' } reply.

const BATCH_SAMPLES = 2048;

class PcmCaptureProcessor extends AudioWorkletProcessor {
  constructor() {
    super();
    this.chunks = [];
    this.buffered = 0;
    this.port.onmessage = (event) => {
      if (event.data === 'flush') {
        this.post();
        this.port.postMessage({ type: 'flushed' });
      }
    };
  }

  post() {
    if (this.buffered === 0) return;
    const batch = new Float32Array(this.buffered);
    let offset = 0;
    for (const chunk of this.chunks) {
      batch.set(chunk, offset);
      offset += chunk.length;
    }
    this.chunks = [];
    this.buffered = 0;
    this.port.postMessage(batch, [batch.buffer]);
  }

  process(inputs) {
    const channel = inputs[0] && inputs[0][0];
    if (channel && channel.length > 0) {
      // The engine reuses input buffers, so the samples are copied.
      this.chunks.push(channel.slice());
      this.buffered += channel.length;
      if (this.buffered >= BATCH_SAMPLES) this.post();
    }
    return true;
  }
}

registerProcessor('signbridge-pcm-capture', PcmCaptureProcessor);
