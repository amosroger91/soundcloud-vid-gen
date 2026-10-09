import assert from "node:assert/strict";
import path from "node:path";
import { writeFile } from "node:fs/promises";
import { root } from "../server/config.mjs";
import { transcribeAudio } from "../server/transcribe.mjs";
import { probe } from "../server/media.mjs";
const file =
  process.argv[2] || path.join(root, "test-results/vocal-fixture.wav");
const duration = Number((await probe(file)).format.duration);
const result = await transcribeAudio(
  file,
  { start: 0, duration, language: "english" },
  (progress, message) => console.log(`${progress}% ${message}`),
  new AbortController().signal,
);
assert.ok(
  result.words.length >= 8,
  "Expected words from the vocal test fixture.",
);
assert.ok(
  result.words.every(
    (word) => word.end > word.start && word.start >= 0 && word.end <= duration,
  ),
);
assert.ok(
  new Set(result.words.map((word) => word.start)).size > 5,
  "Word timestamps must advance.",
);
await writeFile(
  path.join(root, "test-results/transcription-result.json"),
  JSON.stringify({ ...result, duration }, null, 2),
);
console.log(
  `Transcription passed: ${result.words.length} timed words across ${result.cues.length} caption lines.`,
);
