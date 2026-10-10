import test from 'node:test';
import assert from 'node:assert/strict';
import { createCanvas } from '../server/canvas.mjs';
import { drawFrame, frameLayout } from '../shared/composition.mjs';
import { createDirection } from '../shared/direction.mjs';

const track = { title: 'An unusually long title that still needs room to breathe', artist: 'The night shift' };
const analysis = {
  fps: 30, waveformRate: 1, waveform: Array(60).fill(0.3),
  frames: Array.from({ length: 1800 }, (_, i) => ({
    rms: i % 15 < 3 ? -9 : -24,
    peak: i % 15 < 3 ? 0.8 : 0.2,
    bands: Array.from({ length: 56 }, (_, band) => (0.2 + (i % 15 < 3 ? 0.5 : 0)) * (1 - band / 70)),
  })),
};
const base = { track, analysis, duration: 60, branded: false };

function artwork(width, height) {
  const image = createCanvas(width, height);
  const ctx = image.getContext('2d');
  const gradient = ctx.createLinearGradient(0, 0, width, height);
  gradient.addColorStop(0, '#ffae72');
  gradient.addColorStop(1, '#1f2584');
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, width, height);
  return image;
}

test('rendered frames reproduce after seeks and visual remixes change artwork', () => {
  const canvas = createCanvas(540, 960), ctx = canvas.getContext('2d');
  const options = { ...base, width: 540, height: 960, art: artwork(900, 500), time: 9.2 };
  drawFrame(ctx, options);
  const original = Buffer.from(canvas.data());
  drawFrame(ctx, { ...options, time: 54 });
  drawFrame(ctx, { ...options, time: 1 });
  drawFrame(ctx, options);
  assert.deepEqual(canvas.data(), original, 'scrubbing must not change the same timestamp');
  drawFrame(ctx, { ...options, variation: 1 });
  assert.notDeepEqual(canvas.data(), original, 'remix must produce a visible difference');
});

test('all scenes and dissolves keep moving artwork out of the lyric slot', () => {
  const plan = createDirection(base);
  const scenes = ['sleeve', 'orbit', 'panorama'].map((kind) => {
    const shot = plan.shots.find((shot) => shot.kind === kind);
    assert.ok(shot, `fixture needs a ${kind} shot`);
    return shot.start + (shot.end - shot.start) * 0.5;
  });
  scenes.push(plan.shots[1].start + 0.2);
  const canvas = createCanvas(1080, 1920), ctx = canvas.getContext('2d');
  const band = frameLayout(true).lyric;
  for (const art of [artwork(500, 900), artwork(900, 500), null]) {
    for (const time of scenes) {
      drawFrame(ctx, { ...base, art, time, captions: [{ start: 59.8, end: 60, text: 'Later' }] });
      const pixels = ctx.getImageData(band.x, band.y, band.width, band.height).data;
      let stray = 0;
      for (let i = 0; i < pixels.length; i += 4) {
        if (pixels[i] !== 9 || pixels[i + 1] !== 11 || pixels[i + 2] !== 19) stray++;
      }
      assert.equal(stray, 0, `art must leave the lyric field clear at ${time}`);
    }
  }
});
