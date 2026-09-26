import {describe, expect, it} from 'vitest';

import {Resampler, concatFloat32, rms} from './audio.js';

function sine(rate: number, seconds: number, frequency: number) {
  const samples = new Float32Array(Math.round(rate * seconds));
  for (let i = 0; i < samples.length; i++) {
    samples[i] = Math.sin((2 * Math.PI * frequency * i) / rate);
  }
  return samples;
}

function zeroCrossings(samples: Float32Array) {
  let count = 0;
  for (let i = 1; i < samples.length; i++) {
    if (samples[i - 1] < 0 !== samples[i] < 0) count++;
  }
  return count;
}

describe('Resampler', () => {
  it('downsamples 48 kHz to 16 kHz and preserves frequency', () => {
    const input = sine(48000, 1, 440);
    const output = new Resampler(48000).process(input);
    expect(Math.abs(output.length - 16000)).toBeLessThanOrEqual(1);
    expect(Math.abs(zeroCrossings(output) - 880)).toBeLessThanOrEqual(2);
  });

  it('handles non-integer ratios such as 44.1 kHz', () => {
    const output = new Resampler(44100).process(sine(44100, 1, 300));
    expect(Math.abs(output.length - 16000)).toBeLessThanOrEqual(1);
    expect(Math.abs(zeroCrossings(output) - 600)).toBeLessThanOrEqual(2);
  });

  it('produces identical output for chunked and one-shot input', () => {
    for (const rate of [48000, 44100, 16000]) {
      const input = sine(rate, 0.5, 250);
      const oneShot = new Resampler(rate).process(input);
      const chunked = new Resampler(rate);
      const parts: Float32Array[] = [];
      for (
        let offset = 0;
        offset < input.length;
        offset += 128 + (offset % 7)
      ) {
        parts.push(
          chunked.process(input.subarray(offset, offset + 128 + (offset % 7)))
        );
      }
      const joined = concatFloat32(parts);
      expect(joined.length).toBe(oneShot.length);
      for (let i = 0; i < joined.length; i++) {
        expect(joined[i]).toBeCloseTo(oneShot[i], 6);
      }
    }
  });

  it('passes 16 kHz through unchanged', () => {
    const input = Float32Array.from([0.1, -0.2, 0.3, 0.4]);
    expect([...new Resampler(16000).process(input)]).toEqual([...input]);
  });

  it('keeps DC level and rejects upsampling', () => {
    const output = new Resampler(48000).process(
      new Float32Array(4800).fill(0.25)
    );
    expect(output.every((value) => Math.abs(value - 0.25) < 1e-6)).toBe(true);
    expect(() => new Resampler(8000)).toThrow(/Unsupported resampling/);
    expect(() => new Resampler(Number.NaN)).toThrow(/Unsupported resampling/);
  });
});

describe('audio helpers', () => {
  it('concatenates and measures RMS', () => {
    const joined = concatFloat32([
      Float32Array.from([1, 2]),
      new Float32Array(0),
      Float32Array.from([3]),
    ]);
    expect([...joined]).toEqual([1, 2, 3]);
    expect(rms(new Float32Array(0))).toBe(0);
    expect(rms(Float32Array.from([0.5, -0.5]))).toBeCloseTo(0.5);
  });
});
