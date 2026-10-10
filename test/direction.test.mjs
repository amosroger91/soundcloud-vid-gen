import test from "node:test";
import assert from "node:assert/strict";
import { createDirection, directionAt, getDirection } from "../shared/direction.mjs";

const track = { sourceUrl: "https://soundcloud.com/artist/track", title: "Track", artist: "Artist" };
function signal(seconds = 60, attacks = []) {
  const fps = 30;
  return {
    fps,
    frames: Array.from({ length: seconds * fps }, (_, i) => {
      const time = i / fps;
      const sounding = attacks.some((attack) => time >= attack && time < attack + 0.1);
      return { bands: Array(56).fill(sounding ? 0.85 : 0), rms: sounding ? -9 : -60 };
    }),
  };
}

test("direction is deterministic across seeks, new track IDs, and cloned analysis", () => {
  const analysis = signal(60, [2, 5, 11, 16]);
  const options = { track: { ...track, id: "one" }, analysis, start: 1, duration: 30, episode: "021" };
  const first = createDirection(options);
  const second = createDirection({ ...options, track: { ...track, id: "two" }, analysis: structuredClone(analysis) });
  assert.deepEqual(first.shots, second.shots);
  assert.equal(first.seed, second.seed);
  const expected = directionAt(first, 10.04);
  for (const time of [22, 0, 11, 5, 30]) directionAt(first, time);
  assert.deepEqual(directionAt(first, 10.04), expected);
  assert.deepEqual(directionAt(second, 10.04), expected);
  assert.notEqual(createDirection({ ...options, variation: 1 }).seed, first.seed);
  assert.notEqual(createDirection({ ...options, episode: "022" }).seed, first.seed);
});

test("shot schedules cover the clip, respect dwell, and avoid repeated cycles", () => {
  for (const motion of ["dynamic", "drift"]) {
    const minimum = motion === "dynamic" ? 3 : 6;
    const maximum = motion === "dynamic" ? 6 : 9;
    const plan = createDirection({ track, duration: 120, motion });
    assert.equal(plan.shots[0].start, 0);
    assert.equal(plan.shots.at(-1).end, 120);
    plan.shots.forEach((shot, i) => {
      assert.ok(shot.end - shot.start >= minimum - 1e-8);
      assert.ok(shot.end - shot.start <= maximum + 1e-8);
      if (i) {
        assert.equal(shot.start, plan.shots[i - 1].end);
        assert.notEqual(shot.kind, plan.shots[i - 1].kind);
      }
    });
    for (const period of [2, 3]) {
      const kinds = plan.shots.map((shot) => shot.kind);
      assert.ok(kinds.some((kind, i) => i >= period && kind !== kinds[i - period]));
    }
  }
  const openings = new Set(Array.from({ length: 12 }, (_, variation) =>
    createDirection({ track, variation }).shots[0].kind,
  ));
  assert.ok(openings.size > 1, "remixes should not all start with the same shot");
});

test("real attacks use source time minus clip start and decay smoothly", () => {
  const analysis = signal(20, [2, 7]);
  const plan = createDirection({ track, analysis, start: 5, duration: 10 });
  assert.equal(plan.onsets.length, 1);
  assert.ok(Math.abs(plan.onsets[0].time - 2) < 1 / 30);
  assert.equal(directionAt(plan, 1.95).beat, 0);
  assert.ok(directionAt(plan, 2).beat > 0.8);
  assert.ok(directionAt(plan, 2.08).beat < directionAt(plan, 2.04).beat);
  assert.ok(directionAt(plan, 2.6).beat < 0.05);
  const lateStart = createDirection({ track, analysis, start: 7.04, duration: 3 });
  assert.equal(lateStart.onsets.length, 0, "cutting into sustained sound must not fabricate an attack");
});

test("scene cuts favor an actual nearby onset while retaining minimum dwell", () => {
  const options = { track, start: 0, duration: 30, episode: "123" };
  const baseline = createDirection(options);
  const firstCut = baseline.shots[0].end;
  const attack = Math.round(firstCut * 30) / 30;
  const music = createDirection({ ...options, analysis: signal(30, [attack]) });
  assert.ok(Math.abs(music.shots[0].end - attack) < 1e-8);
  assert.ok(music.shots[0].end >= 3);
});

test("silent and missing analysis have no fabricated beat or energy", () => {
  for (const analysis of [undefined, {}, signal(30)]) {
    const plan = createDirection({ track, analysis });
    assert.deepEqual(plan.onsets, []);
    for (const time of [0, 2.4, 11.11, 30]) {
      const direction = directionAt(plan, time);
      assert.equal(direction.beat, 0);
      assert.equal(direction.energy, 0);
      assert.equal(direction.bass, 0);
      assert.equal(direction.treble, 0);
    }
  }
});

test("sustained loudness drives energy without repeatedly pretending to be a beat", () => {
  const analysis = {
    fps: 30,
    frames: Array.from({ length: 300 }, () => ({ bands: Array(56).fill(0.8), rms: -9 })),
  };
  const plan = createDirection({ track, analysis, duration: 10 });
  assert.deepEqual(plan.onsets, []);
  for (const time of [0, 2.1, 4.8, 9.9]) {
    const direction = directionAt(plan, time);
    assert.equal(direction.beat, 0);
    assert.ok(direction.energy > 0.8);
    assert.ok(direction.bass > 0.7);
  }
});

test("metrics remain bounded and transitions settle after each cut", () => {
  const analysis = signal(30, [1, 4, 8, 16]);
  const plan = createDirection({ track, analysis });
  for (let time = -1; time <= 31; time += 0.031) {
    const direction = directionAt(plan, time);
    for (const key of ["progress", "transition", "beat", "energy", "bass", "treble"])
      assert.ok(direction[key] >= 0 && direction[key] <= 1, `${key} is ${direction[key]}`);
  }
  const cut = plan.shots[1].start;
  assert.equal(directionAt(plan, cut).transition, 0);
  assert.equal(directionAt(plan, cut + 0.5).transition, 1);
  const tiny = createDirection({ duration: 0 });
  assert.ok(Number.isFinite(directionAt(tiny, 0).progress));
});

test("cached direction changes with clip bounds and remix but reuses repeat frames", () => {
  const options = { track, analysis: signal(60), duration: 30 };
  const cached = getDirection(options);
  assert.equal(getDirection({ ...options, time: 5 }), cached);
  assert.notEqual(getDirection({ ...options, start: 3 }), cached);
  assert.notEqual(getDirection({ ...options, variation: 1 }), cached);
  assert.notEqual(getDirection({ ...options, motion: "drift" }), cached);
});
