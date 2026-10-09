import test from "node:test";
import assert from "node:assert/strict";
import { createCanvas } from "../server/canvas.mjs";
import { lyricPresentation, scoreLyricSync } from "../shared/captions.mjs";
import { drawFrame, frameLayout } from "../shared/composition.mjs";

const frame = 1 / 30;
const cues = [
  {
    start: 1,
    end: 2,
    text: "City lights",
    words: [
      { text: "City", start: 1, end: 1.4 },
      { text: "lights", start: 1.4, end: 2 },
    ],
  },
];
const reference = [
  { text: "City", start: 0.5, end: 0.9 },
  { text: "lights", start: 1, end: 1.4 },
  { text: "glow", start: 1.5, end: 1.9 },
];

function shown(time) {
  return lyricPresentation(cues, time);
}

test("the shown word changes on the timestamp, within one video frame", () => {
  assert.equal(shown(1 - frame).visible, false);
  assert.equal(shown(1).activeWord.text, "City");
  assert.equal(shown(1.4 - frame).activeWord.text, "City");
  assert.equal(shown(1.4).activeWord.text, "lights");
  assert.equal(shown(2 - frame).activeWord.text, "lights");
  assert.equal(shown(2).visible, false);
});

test("lyric layout opens a slot under the title and keeps it off the artwork", () => {
  const plain = frameLayout(false);
  const lyric = frameLayout(true);
  assert.equal(plain.art.size, 720);
  assert.equal(plain.lyric, null);
  assert.equal(lyric.art.size, 500);
  assert.ok(lyric.art.y < plain.art.y);
  const artBottom = lyric.art.y + lyric.art.size / 2;
  assert.ok(lyric.lyric.y >= artBottom);
  assert.ok(lyric.lyric.y >= lyric.artistY + lyric.artistSize);
  assert.ok(lyric.lyric.y + lyric.lyric.height <= lyric.spectrumY);
});

function ink(ctx, x, y, width, height, accent) {
  const data = ctx.getImageData(x, y, width, height).data;
  let light = 0;
  let orange = 0;
  for (let i = 0; i < data.length; i += 4) {
    const [r, g, b] = [data[i], data[i + 1], data[i + 2]];
    if (r + g + b > 520) light++;
    if (accent && r > 200 && g > 70 && g < 180 && b < 120) orange++;
  }
  return { light, orange };
}

function scene(time, captions, start = 0) {
  const canvas = createCanvas(1080, 1920);
  const ctx = canvas.getContext("2d");
  drawFrame(ctx, {
    track: { title: "Te Acuerdas", artist: "Roger Amos" },
    analysis: {
      fps: 30,
      waveformRate: 10,
      waveform: Array(80).fill(0.2),
      frames: [
        {
          bands: Array(56).fill(0.45),
          rms: -15,
          centroid: 900,
          peak: 0.2,
        },
      ],
    },
    time,
    start,
    duration: 8,
    theme: "ember",
    episode: "001",
    branded: true,
    captions,
  });
  return ctx;
}

test("lyrics are drawn in the reserved slot and not over the artwork", () => {
  const band = frameLayout(true).lyric;
  const art = frameLayout(true).art;
  const active = scene(1.2, cues);
  const gap = scene(0.2, cues);
  const artPatch = {
    x: art.x - 30,
    y: art.y - 30,
    width: 60,
    height: 60,
  };
  const shownInk = ink(active, band.x, band.y, band.width, band.height, true);
  const hiddenInk = ink(gap, band.x, band.y, band.width, band.height, true);
  assert.ok(shownInk.light > 40, `expected lyric ink, saw ${shownInk.light}`);
  assert.ok(shownInk.orange > 10, `expected the active word, saw ${shownInk.orange}`);
  assert.ok(hiddenInk.light < 10, `gap should be empty, saw ${hiddenInk.light}`);
  assert.equal(hiddenInk.orange, 0);
  const activeArt = active.getImageData(
    artPatch.x,
    artPatch.y,
    artPatch.width,
    artPatch.height,
  ).data;
  const gapArt = gap.getImageData(
    artPatch.x,
    artPatch.y,
    artPatch.width,
    artPatch.height,
  ).data;
  let drift = 0;
  for (let i = 0; i < activeArt.length; i++)
    drift = Math.max(drift, Math.abs(activeArt[i] - gapArt[i]));
  assert.ok(drift <= 2, `artwork changed under the lyric, drift ${drift}`);
  const shifted = scene(1.2, cues, 10);
  const sameSlot = ink(shifted, band.x, band.y, band.width, band.height, true);
  assert.ok(sameSlot.orange > 10, "caption time stays relative to the clip");
});

test("the intro and outro logo cover the whole frame", () => {
  const band = frameLayout(true).lyric;
  for (const time of [3.7, 9.6]) {
    const ctx = scene(time, cues);
    const lyrics = ink(ctx, band.x, band.y, band.width, 80, true);
    const corner = ink(ctx, 0, 0, 80, 80);
    const foot = ink(ctx, 0, 1840, 80, 80);
    const mark = ink(ctx, 120, 500, 840, 1100, true);
    assert.ok(lyrics.light < 15, `lyrics still visible at ${time}`);
    assert.ok(corner.light < 15, `top corner not covered at ${time}`);
    assert.ok(foot.light < 15, `bottom corner not covered at ${time}`);
    assert.ok(mark.light > 200, `logo missing at ${time}: ${mark.light}`);
    assert.ok(mark.orange > 80, `logo mark missing at ${time}: ${mark.orange}`);
  }
});

test("lyric sync score separates late timing from wrong words", () => {
  const perfect = scoreLyricSync(reference, reference);
  assert.equal(perfect.wer, 0);
  assert.equal(perfect.medianAbsOnsetMs, 0);
  assert.equal(perfect.within200, 1);
  const late = reference.map((word) => ({
    ...word,
    start: word.start + 0.18,
    end: word.end + 0.18,
  }));
  const lateScore = scoreLyricSync(late, reference);
  assert.equal(lateScore.wer, 0);
  assert.ok(Math.abs(lateScore.meanSignedOnsetMs - 180) < 0.001);
  assert.ok(Math.abs(lateScore.medianAbsOnsetMs - 180) < 0.001);
  assert.equal(lateScore.within200, 1);
  assert.equal(lateScore.within400, 1);
  const misheard = [
    { text: "Kitty", start: 0.5, end: 0.9 },
    { text: "lights", start: 1, end: 1.4 },
    { text: "glow", start: 1.5, end: 1.9 },
  ];
  const heard = scoreLyricSync(misheard, reference);
  assert.ok(heard.wer > 0);
  assert.equal(heard.substitutions, 1);
  assert.equal(heard.matched, 2);
});
