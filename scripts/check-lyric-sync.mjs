import assert from "node:assert/strict";
import { readFile } from "node:fs/promises";
import { probe } from "../server/media.mjs";
import { transcribeAudio } from "../server/transcribe.mjs";
import { scoreLyricSync } from "../shared/captions.mjs";

// Objective lyric check.
// 1. Time the words you actually hear. Save them as JSON:
//    { "words": [ { "text": "city", "start": 0.42, "end": 0.81 } ] }
//    Times are seconds into the clip, not into the whole file.
// 2. Run: node scripts/check-lyric-sync.mjs <audio> <reference.json> [start] [duration]
// The score reports word error rate and onset error. A positive onset bias
// means the heard lyric is late. This does not judge by watching the video.
const TIMING_FAIL_MS = 250;
const EXTRACTION_FAIL_WER = 0.35;

const [file, referencePath, startArg, durationArg] = process.argv.slice(2);
if (!file || !referencePath) {
  console.log(
    "Usage: node scripts/check-lyric-sync.mjs <audio> <reference.json> [start] [duration]",
  );
  process.exit(1);
}
const reference = JSON.parse(await readFile(referencePath, "utf8"));
assert.ok(
  Array.isArray(reference.words) && reference.words.length,
  "Reference JSON needs a non-empty words array.",
);
const probed = Number((await probe(file)).format.duration);
const start = Number(startArg || 0);
const duration = Number(durationArg || Math.max(0.1, probed - start));
const result = await transcribeAudio(
  file,
  { start, duration, language: reference.language || "auto" },
  (progress, message) => console.log(`${progress}% ${message}`),
  new AbortController().signal,
);
const score = scoreLyricSync(result.words, reference.words);
const round = (value) =>
  value == null ? "n/a" : `${Math.round(value * 10) / 10}`;
const percent = (value) =>
  value == null ? "n/a" : `${Math.round(value * 100)}%`;
console.log("");
console.log("Lyric sync");
console.log(`  reference words: ${score.referenceCount}`);
console.log(`  heard words: ${score.hypothesisCount}`);
console.log(
  `  word error rate: ${round(score.wer * 100)}% (${score.substitutions} sub, ${score.deletions} del, ${score.insertions} ins)`,
);
console.log(
  `  onset bias: ${round(score.meanSignedOnsetMs)} ms (positive means the lyric is late)`,
);
console.log(
  `  median absolute onset error: ${round(score.medianAbsOnsetMs)} ms`,
);
console.log(`  within 200 ms: ${percent(score.within200)}`);
console.log(`  within 400 ms: ${percent(score.within400)}`);
console.log("  heard:");
for (const word of result.words)
  console.log(
    `    ${word.start.toFixed(2)}–${word.end.toFixed(2)}  ${word.text}`,
  );
const timingFailed =
  score.medianAbsOnsetMs == null || score.medianAbsOnsetMs > TIMING_FAIL_MS;
const extractionFailed = score.wer > EXTRACTION_FAIL_WER;
if (timingFailed || extractionFailed) {
  console.log(
    `FAIL  timing ${timingFailed ? "above" : "within"} ${TIMING_FAIL_MS} ms, extraction ${extractionFailed ? "above" : "within"} ${Math.round(EXTRACTION_FAIL_WER * 100)}% word error.`,
  );
  process.exit(1);
}
console.log(
  `PASS  median onset error within ${TIMING_FAIL_MS} ms and word error within ${Math.round(EXTRACTION_FAIL_WER * 100)}%.`,
);
