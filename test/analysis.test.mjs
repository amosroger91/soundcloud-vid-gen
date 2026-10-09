import test from "node:test";
import assert from "node:assert/strict";
import { analyzeSamples } from "../server/analysis.mjs";
import { clipWaveform, frameAt } from "../shared/composition.mjs";

test("FFT detects a 440 Hz tone and measures its RMS level", () => {
  const rate = 16000;
  const samples = Float32Array.from(
    { length: rate },
    (_, i) => 0.5 * Math.sin((2 * Math.PI * 440 * i) / rate),
  );
  const result = analyzeSamples(samples);
  const frame = result.frames[15];
  assert.ok(Math.abs(frame.centroid - 440) < 8, `centroid ${frame.centroid}`);
  assert.ok(Math.abs(frame.rms - -9) <= 1, `RMS ${frame.rms}`);
  assert.equal(result.frames.length, 30);
  assert.equal(frame.bands.length, 56);
  assert.ok(Math.max(...frame.bands) > 0.8);
});
test("silence is finite and does not produce a fabricated spectrum", () => {
  const result = analyzeSamples(new Float32Array(16000));
  for (const frame of result.frames) {
    assert.equal(frame.centroid, 0);
    assert.equal(frame.rms, -60);
    assert.ok(frame.bands.every((value) => value === 0));
  }
});
test("waveform follows the selected clip, not the beginning of the track", () => {
  const analysis = { waveformRate: 2, waveform: [0, 0, 0.5, 0.7, 0.9, 0.1] };
  assert.deepEqual(clipWaveform(analysis, 1, 1, 2), [0.5, 0.7]);
});
test("frame lookup handles beginning and end boundaries", () => {
  const data = { fps: 30, frames: ["first", "last"] };
  assert.equal(frameAt(data, -1), "first");
  assert.equal(frameAt(data, 30), "last");
});
