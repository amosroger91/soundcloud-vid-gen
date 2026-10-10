import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import { copyFile, mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { createDemo, finishTrack, probe } from "../server/media.mjs";
import { root, ffmpegPath } from "../server/config.mjs";
import { trackDir, renderDir } from "../server/storage.mjs";
import { run } from "../server/process.mjs";
import { createCanvas, loadImage } from "../server/canvas.mjs";
import { frameLayout } from "../shared/composition.mjs";

// Run against a local server using the same DATA_DIR. The original instrumental
// fixture and explicit caption text test duration/timing, not lyric recognition.
const base = process.env.APP_URL || "http://127.0.0.1:4317";
const signal = new AbortController().signal;
async function request(route, body) {
  const response = await fetch(new URL(route, base), body === undefined ? {} : {
    method: "POST", headers: { "Content-Type": "application/json" }, body: JSON.stringify(body),
  });
  const result = await response.json();
  assert.ok(response.ok, result.error);
  return result;
}

console.log("Preparing a 72.5-second original audio fixture…");
const demo = await createDemo(randomUUID(), () => {}, signal);
const id = randomUUID();
await mkdir(trackDir(id), { recursive: true });
await copyFile(path.join(trackDir(demo.id), "artwork.jpg"), path.join(trackDir(id), "artwork.jpg"));
await run(ffmpegPath, [
  "-y", "-v", "error", "-stream_loop", "-1", "-i", path.join(trackDir(demo.id), "audio.mp3"),
  "-t", "72.5", "-c:a", "libmp3lame", "-b:a", "192k", path.join(trackDir(id), "audio.mp3"),
], { signal });
const track = await finishTrack(id, {
  title: "Full-song regression fixture", artist: "Finds Studio", hasArtwork: true, source: "demo",
}, () => {}, signal);
const cues = [{ start: 64, end: 68, text: "Lyrics beyond one minute" }];
let job = await request("/api/videos", { trackId: id, captions: cues, branded: false });
const early = await fetch(new URL(`/api/renders/${job.id}/download`, base));
assert.equal(early.status, 404, "unfinished jobs must not offer downloads");
await early.body?.cancel();
const deadline = Date.now() + 8 * 60 * 1000;
let progress = -1;
while (["queued", "running"].includes(job.status)) {
  if (Date.now() > deadline) throw new Error("Full-song verification timed out.");
  await new Promise((resolve) => setTimeout(resolve, 1000));
  job = await request(`/api/jobs/${job.id}`);
  if (Math.floor(job.progress / 10) > progress) {
    progress = Math.floor(job.progress / 10);
    console.log(`${job.progress}% ${job.message}`);
  }
}
assert.equal(job.status, "complete", job.error);
assert.equal(job.result.fullLength, true);
assert.equal(job.result.clipDuration, track.duration);
assert.equal(job.result.sourceDuration, track.duration);
assert.deepEqual(job.result.captions, cues);
const file = path.join(renderDir(job.id), "soundcloud-finds.mp4");
const info = await probe(file, signal);
const video = info.streams.find((stream) => stream.codec_type === "video");
assert.deepEqual([video.width, video.height, video.codec_name], [1080, 1920, "h264"]);
assert.ok(Math.abs(Number(info.format.duration) - track.duration) < 0.15);
const srt = await (await fetch(new URL(job.result.captionsUrl, base))).text();
assert.match(srt, /00:01:04,000 --> 00:01:08,000/);

const directory = path.join(root, "test-results");
await mkdir(directory, { recursive: true });
const frameFile = path.join(directory, "full-song-late-lyrics.png");
await run(ffmpegPath, ["-y", "-v", "error", "-ss", "65", "-i", file, "-frames:v", "1", frameFile], { signal });
const canvas = createCanvas(1080, 1920), ctx = canvas.getContext("2d");
ctx.drawImage(await loadImage(frameFile), 0, 0);
const band = frameLayout(true).lyric;
const pixels = ctx.getImageData(band.x, band.y, band.width, band.height).data;
let accent = 0;
for (let i = 0; i < pixels.length; i += 4)
  if (pixels[i] > 180 && pixels[i + 1] > 50 && pixels[i + 1] < 180 && pixels[i + 2] < 130) accent++;
assert.ok(accent > 100, `Expected a highlighted lyric after 60 seconds, got ${accent} pixels.`);

async function pcm(input) {
  const raw = await run(ffmpegPath, [
    "-v", "error", "-i", input, "-ss", "65", "-t", "2", "-ac", "1", "-ar", "16000", "-f", "f32le", "pipe:1",
  ], { signal, binary: true });
  return Float32Array.from({ length: raw.length / 4 }, (_, i) => raw.readFloatLE(i * 4));
}
const source = await pcm(path.join(trackDir(id), "audio.mp3")), output = await pcm(file);
let dot = 0, a = 0, b = 0;
assert.ok(output.length >= 30000, "Audio must continue beyond one minute.");
for (let i = 800; i < Math.min(source.length, output.length); i++) {
  dot += source[i] * output[i];
  a += source[i] ** 2;
  b += output[i] ** 2;
}
const correlation = dot / Math.sqrt(a * b);
assert.ok(correlation > 0.9, `Late audio sync: ${correlation}`);
await writeFile(path.join(directory, "full-song-report.json"), JSON.stringify({
  passed: true, trackId: id, jobId: job.id, file,
  sourceDuration: track.duration, outputDuration: Number(info.format.duration), lateAudioCorrelation: correlation,
}, null, 2));
console.log(`Full-song check passed: ${info.format.duration}s, lyrics and matching audio after 60 seconds.`);
