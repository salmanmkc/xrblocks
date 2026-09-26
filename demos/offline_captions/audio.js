export const TARGET_SAMPLE_RATE = 16000;

/**
 * Stateful mono downsampler. Each output sample is the box-filtered average of
 * the input samples it covers, so chunked and one-shot processing agree.
 */
export class Resampler {
  /**
   * @param {number} inputRate
   * @param {number} [outputRate]
   */
  constructor(inputRate, outputRate = TARGET_SAMPLE_RATE) {
    if (
      !Number.isFinite(inputRate) ||
      !Number.isFinite(outputRate) ||
      outputRate <= 0 ||
      inputRate < outputRate
    ) {
      throw new Error(
        `Unsupported resampling from ${inputRate} Hz to ${outputRate} Hz.`
      );
    }
    this.ratio = inputRate / outputRate;
    this.position = 0;
    this.pending = new Float32Array(0);
  }

  /**
   * @param {Float32Array} input
   * @returns {Float32Array}
   */
  process(input) {
    const data = concatFloat32([this.pending, input]);
    const half = this.ratio / 2;
    const output = new Float32Array(
      Math.max(0, Math.ceil((data.length - this.position) / this.ratio) + 1)
    );
    let count = 0;
    let t = this.position;
    while (Math.floor(t + half) < data.length) {
      const start = Math.max(0, Math.ceil(t - half));
      const end = Math.min(data.length - 1, Math.floor(t + half));
      let sum = 0;
      for (let i = start; i <= end; i++) sum += data[i];
      output[count++] = sum / (end - start + 1);
      t += this.ratio;
    }
    const drop = Math.max(0, Math.min(data.length, Math.floor(t - half)));
    this.pending = data.slice(drop);
    this.position = t - drop;
    return output.subarray(0, count);
  }
}

/**
 * @param {Float32Array[]} parts
 * @returns {Float32Array}
 */
export function concatFloat32(parts) {
  let length = 0;
  for (const part of parts) length += part.length;
  const output = new Float32Array(length);
  let offset = 0;
  for (const part of parts) {
    output.set(part, offset);
    offset += part.length;
  }
  return output;
}

/**
 * @param {Float32Array} samples
 * @returns {number}
 */
export function rms(samples) {
  if (!samples.length) return 0;
  let sum = 0;
  for (const sample of samples) sum += sample * sample;
  return Math.sqrt(sum / samples.length);
}
