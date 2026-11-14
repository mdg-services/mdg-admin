/**
 * Pure helpers for voice-note waveforms. No React, no DOM — safe to unit test and
 * cheap to run on a low-end Android WebView. A copy of the part of the dealer
 * app's `lib/waveform.ts` that the recorder needs.
 */

/** Default bar count for a rendered waveform. Kept small for cheap layout. */
export const WAVEFORM_BARS = 32;

/**
 * Downsample arbitrary-length amplitude samples to `count` peaks (max per
 * bucket), then normalize so the loudest bar ≈ 1. Returns `[]` when there is
 * nothing to sample (e.g. AnalyserNode unavailable) so callers can fall back.
 */
export function downsamplePeaks(samples: number[], count = WAVEFORM_BARS): number[] {
  if (!samples || samples.length === 0) return [];
  const n = samples.length;
  const out: number[] = new Array(count);
  for (let i = 0; i < count; i += 1) {
    const start = Math.floor((i * n) / count);
    const end = Math.max(start + 1, Math.floor(((i + 1) * n) / count));
    let peak = 0;
    for (let j = start; j < end && j < n; j += 1) {
      const v = samples[j] ?? 0;
      if (v > peak) peak = v;
    }
    out[i] = peak;
  }
  let max = 0;
  for (const v of out) if (v > max) max = v;
  for (let i = 0; i < count; i += 1) {
    out[i] = max > 0 ? Math.max(0.08, (out[i] ?? 0) / max) : 0.08;
  }
  return out;
}
