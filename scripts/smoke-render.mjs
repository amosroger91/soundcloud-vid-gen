import assert from "node:assert/strict";
import { randomUUID } from "node:crypto";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { createDemo, probe } from "../server/media.mjs";
import { renderVideo } from "../server/render.mjs";
import { root, dataDir, ffmpegPath } from "../server/config.mjs";
import { run } from "../server/process.mjs";
import { totalDuration } from "../shared/timeline.mjs";

const id = randomUUID(),
  exportId = randomUUID();
const signal = new AbortController().signal;
console.log("Creating original demo audio and artwork...");
const track = await createDemo(id, () => {}, signal);
console.log(
  "Rendering an 8-second clip, logo animations, captions, and the thank-you ending...",
);
const options = {
  trackId: id,
  start: 4,
  duration: 8,
  theme: "ember",
  episode: "001",
  branded: true,
  captions: [
    { start: 0.5, end: 2.4, text: "Caption animation test" },
    { start: 5.8, end: 7.8, text: "A little more listening" },
  ],
};
await renderVideo(
  exportId,
  options,
  (progress, message) => console.log(`${progress}% ${message}`),
  signal,
);
const file = path.join(dataDir, "renders", exportId, "soundcloud-finds.mp4");
const info = await probe(file);
const video = info.streams.find((stream) => stream.codec_type === "video");
const audio = info.streams.find((stream) => stream.codec_type === "audio");
assert.equal(video.width, 1080);
assert.equal(video.height, 1920);
assert.equal(video.codec_name, "h264");
assert.equal(video.pix_fmt, "yuv420p");
assert.equal(video.r_frame_rate, "30/1");
assert.equal(audio.codec_name, "aac");
assert.ok(
  Math.abs(Number(info.format.duration) - totalDuration(options.duration)) <
    0.15,
);
// Decode the exported audio and check sample correlation against the selected source segment.
async function pcm(file, start = 0) {
  const data = await run(
    ffmpegPath,
    [
      "-v",
      "error",
      "-ss",
      String(start),
      "-i",
      file,
      "-t",
      "2.5",
      "-ac",
      "1",
      "-ar",
      "16000",
      "-f",
      "f32le",
      "pipe:1",
    ],
    { binary: true },
  );
  return Float32Array.from({ length: data.length / 4 }, (_, i) =>
    data.readFloatLE(i * 4),
  );
}
const source = await pcm(
  path.join(dataDir, "tracks", track.id, "audio.mp3"),
  4,
);
const output = await pcm(file);
let dot = 0,
  sourcePower = 0,
  outputPower = 0;
for (let i = 1600; i < Math.min(source.length, output.length); i++) {
  dot += source[i] * output[i];
  sourcePower += source[i] ** 2;
  outputPower += output[i] ** 2;
}
const correlation = dot / Math.sqrt(sourcePower * outputPower);
assert.ok(correlation > 0.9, `Audio sync correlation ${correlation}`);
const results = path.join(root, "test-results");
await mkdir(results, { recursive: true });
await run(ffmpegPath, [
  "-y",
  "-v",
  "error",
  "-ss",
  "1",
  "-i",
  file,
  "-frames:v",
  "1",
  path.join(results, "export-frame.png"),
]);
for (const [name, time] of [
  ["intro", 4.1],
  ["lyrics", 6.8],
  ["outro", 9.6],
  ["thanks", 13.2],
]) {
  await run(ffmpegPath, [
    "-y",
    "-v",
    "error",
    "-ss",
    String(time),
    "-i",
    file,
    "-frames:v",
    "1",
    path.join(results, `${name}-frame.png`),
  ]);
}
const silent = await pcm(file, options.duration + 0.5);
assert.ok(
  silent.every((value) => Math.abs(value) < 0.0001),
  "The song must stop before the outro.",
);
await writeFile(
  path.join(results, "render-report.json"),
  JSON.stringify(
    {
      file,
      trackId: track.id,
      exportId,
      width: video.width,
      height: video.height,
      fps: video.r_frame_rate,
      videoCodec: video.codec_name,
      audioCodec: audio.codec_name,
      duration: info.format.duration,
      audioCorrelation: correlation,
    },
    null,
    2,
  ),
);
console.log(
  JSON.stringify({ passed: true, file, audioCorrelation: correlation }),
);
