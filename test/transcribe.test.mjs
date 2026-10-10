import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, rm } from "node:fs/promises";
import os from "node:os";
import path from "node:path";
import { run } from "../server/process.mjs";
import { ffmpegPath } from "../server/config.mjs";
import { transcribeAudio } from "../server/transcribe.mjs";
import { generateVideo } from "../server/generate.mjs";
import { renderSchema } from "../server/validation.mjs";

test("transcription decodes all audio past a minute and retains late word timestamps", async (t) => {
  const directory = await mkdtemp(path.join(os.tmpdir(), "finds-transcribe-full-"));
  t.after(() => rm(directory, { recursive: true, force: true }));
  const file = path.join(directory, "tone.wav");
  const signal = new AbortController().signal;
  await run(ffmpegPath, ["-y", "-v", "error", "-f", "lavfi", "-i", "sine=frequency=440:duration=90", "-ar", "16000", file], { signal });
  // Recognition itself is substituted; the real decoder must feed the full
  // source to it, and the real normalization/grouping retains the late words.
  const result = await transcribeAudio(file, { start: 0, duration: 90 }, () => {}, signal, {
    loadTranscriber: async () => async (samples) => {
      assert.equal(samples.length, 90 * 16000);
      return { chunks: [
        { text: "Still", timestamp: [74.8, 76] },
        { text: "singing.", timestamp: [75, 75.4] },
        { text: "Past", timestamp: [75, 75.7] },
        { text: "the", timestamp: [75.2, 77] },
        { text: "boundary.", timestamp: [76, 76.8] },
        { text: "Ending", timestamp: [88, 89] },
        { text: "now", timestamp: [89.5, 91] },
      ] };
    },
  });
  assert.equal(result.words.at(-1).end, 90);
  assert.equal(result.cues.at(-1).text, "Ending now");
  const id = "310b3a1c-9693-4a5e-9eec-c3da41060270";
  let rendered = false;
  const video = await generateVideo(id, { trackId: id }, () => {}, signal, {
    getTrack: async () => ({ id, duration: 90 }),
    transcribeTrack: async () => result,
    renderVideo: async (_, options) => {
      renderSchema.parse(options);
      assert.deepEqual(options.captions, result.cues);
      rendered = true;
      return { clipDuration: options.duration };
    },
  });
  assert.equal(rendered, true, "automatic lyrics must reach rendering without timing validation errors");
  assert.equal(video.fullLength, true);
});
