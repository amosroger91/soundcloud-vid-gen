import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { mkdir, copyFile, writeFile } from "node:fs/promises";
import path from "node:path";
import { root, ffmpegPath } from "../server/config.mjs";
import { createDemo, finishTrack } from "../server/media.mjs";
import { trackDir } from "../server/storage.mjs";
import { run } from "../server/process.mjs";

const base = process.env.APP_URL || "http://127.0.0.1:4317";
async function request(route, body) {
  const response = await fetch(
    new URL(route, base),
    body
      ? {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(body),
        }
      : {},
  );
  const result = await response.json();
  assert.ok(response.ok, result.error);
  return result;
}
async function complete(job) {
  const deadline = Date.now() + 240000;
  while (["queued", "running"].includes(job.status)) {
    if (Date.now() > deadline)
      throw new Error("Workflow verification timed out.");
    await new Promise((resolve) => setTimeout(resolve, 1000));
    job = await request(`/api/jobs/${job.id}`);
  }
  assert.equal(job.status, "complete", job.error);
  return job;
}
const signal = new AbortController().signal;
const demo = await createDemo(randomUUID(), () => {}, signal);
const id = randomUUID();
await mkdir(trackDir(id), { recursive: true });
await copyFile(
  path.join(trackDir(demo.id), "artwork.jpg"),
  path.join(trackDir(id), "artwork.jpg"),
);
const fixture =
  process.argv[2] || path.join(root, "test-results/vocal-fixture.wav");
await run(ffmpegPath, [
  "-y",
  "-v",
  "error",
  "-i",
  fixture,
  "-i",
  path.join(trackDir(demo.id), "audio.mp3"),
  "-filter_complex",
  "[1:a]volume=0.15[bed];[0:a][bed]amix=inputs=2:duration=first:normalize=0[mix]",
  "-map",
  "[mix]",
  "-c:a",
  "libmp3lame",
  "-b:a",
  "192k",
  path.join(trackDir(id), "audio.mp3"),
]);
const track = await finishTrack(
  id,
  {
    title: "City Lights — vocal test",
    artist: "Finds Studio",
    hasArtwork: true,
    source: "test-fixture",
  },
  () => {},
  signal,
);
const duration = Math.min(8, Math.floor(track.duration * 100) / 100);
const transcription = await complete(
  await request("/api/transcriptions", {
    trackId: id,
    start: 0,
    duration,
    language: "english",
  }),
);
assert.ok(transcription.result.words.length >= 8);
assert.match(
  transcription.result.words
    .map((word) => word.text)
    .join(" ")
    .toLowerCase(),
  /city lights/,
);
console.log(
  `Vocal-over-music transcription: ${transcription.result.words.length} words.`,
);
const video = await complete(
  await request("/api/renders", {
    trackId: id,
    start: 0,
    duration,
    theme: "violet",
    episode: "002",
    captions: transcription.result.cues,
  }),
);
assert.match(video.result.description, /Finds Studio/);
const cancelled = await request("/api/transcriptions", {
  trackId: id,
  start: 0,
  duration,
  language: "english",
});
await request(`/api/jobs/${cancelled.id}/cancel`, {});
assert.equal((await request(`/api/jobs/${cancelled.id}`)).status, "cancelled");
assert.equal((await request(`/api/tracks/${id}`)).title, track.title);
await writeFile(
  path.join(root, "test-results/vocal-workflow-report.json"),
  JSON.stringify(
    {
      passed: true,
      trackId: id,
      transcriptionId: transcription.id,
      wordCount: transcription.result.words.length,
      renderId: video.id,
      ...video.result,
    },
    null,
    2,
  ),
);
console.log(
  `Vocal workflow passed. Video: ${video.result.videoUrl}. Cancellation preserved source media.`,
);
