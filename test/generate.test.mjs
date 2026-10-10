import test from "node:test";
import assert from "node:assert/strict";
import { generateVideo } from "../server/generate.mjs";
import { videoSchema, renderSchema, transcribeSchema } from "../server/validation.mjs";
import { parseEditor, cuesToSrt } from "../shared/captions.mjs";

const id = "310b3a1c-9693-4a5e-9eec-c3da41060270";
const track = { id, duration: 182.75, title: "Whole song" };
const captions = [{ start: 170, end: 174, text: "The final verse" }];
function fixture() {
  const calls = [];
  const dependencies = {
    importTrack: async () => { calls.push("import"); return track; },
    getTrack: async () => track,
    transcribeTrack: async (options) => { calls.push(["transcribe", options]); return { cues: captions }; },
    renderVideo: async (_, options) => { calls.push(["render", options]); return { clipDuration: options.duration }; },
  };
  return { calls, dependencies };
}
test("one URL generates lyrics then renders every second of a song longer than a minute", async () => {
  const { calls, dependencies } = fixture();
  const result = await generateVideo(id, videoSchema.parse({ url: "https://soundcloud.com/artist/song" }),
    () => {}, new AbortController().signal, dependencies);
  assert.equal(calls[0], "import");
  assert.deepEqual(calls[1], ["transcribe", { trackId: id, start: 0, duration: 182.75, language: "auto" }]);
  assert.equal(calls[2][0], "render");
  assert.equal(calls[2][1].start, 0);
  assert.equal(calls[2][1].duration, 182.75);
  assert.deepEqual(calls[2][1].captions, captions);
  assert.equal(result.fullLength, true);
  assert.equal(result.sourceDuration, 182.75);
});
test("transcription failure cannot silently produce a lyric-free download", async () => {
  const { calls, dependencies } = fixture();
  dependencies.transcribeTrack = async () => { throw new Error("Model failed"); };
  await assert.rejects(generateVideo(id, { trackId: id }, () => {}, new AbortController().signal, dependencies), /Model failed/);
  assert.equal(calls.length, 0);
});
test("cancelled generation never advances from transcription to rendering", async () => {
  const { calls, dependencies } = fixture();
  const controller = new AbortController();
  dependencies.transcribeTrack = async () => { controller.abort(); return { cues: captions }; };
  await assert.rejects(generateVideo(id, { trackId: id }, () => {}, controller.signal, dependencies), { name: "AbortError" });
  assert.equal(calls.length, 0);
});
test("explicit lyric edits reuse the full source and successful instrumental detection can render", async () => {
  for (const supplied of [captions, []]) {
    const { calls, dependencies } = fixture();
    await generateVideo(id, { trackId: id, captions: supplied }, () => {}, new AbortController().signal, dependencies);
    assert.equal(calls.length, 1);
    assert.deepEqual(calls[0][1].captions, supplied);
    assert.equal(calls[0][1].duration, track.duration);
  }
  const { calls, dependencies } = fixture();
  dependencies.transcribeTrack = async () => ({ cues: [], note: "Instrumental" });
  const result = await generateVideo(id, { trackId: id }, () => {}, new AbortController().signal, dependencies);
  assert.equal(calls.length, 1);
  assert.equal(result.transcriptionNote, "Instrumental");
});
test("full-song requests reject clip bounds and ambiguous sources", () => {
  for (const input of [{}, { demo: false }, { demo: true, trackId: id },
    { url: "https://soundcloud.com/a/b", duration: 30 }, { trackId: id, start: 10 }])
    assert.equal(videoSchema.safeParse(input).success, false);
  assert.equal(videoSchema.parse({ demo: true }).captions, undefined);
});
test("ten-minute audio and captions after sixty seconds remain valid throughout the pipeline", () => {
  const cues = parseEditor("180 --> 185 | Still singing\n598 --> 600 | Last line", 600);
  assert.equal(renderSchema.parse({ trackId: id, start: 0, duration: 600, captions: cues }).duration, 600);
  assert.equal(transcribeSchema.parse({ trackId: id, start: 0, duration: 600 }).duration, 600);
  assert.match(cuesToSrt(cues), /00:09:58,000 --> 00:10:00,000/);
  assert.equal(renderSchema.safeParse({ trackId: id, start: 0, duration: 180, captions: cues }).success, false);
});
