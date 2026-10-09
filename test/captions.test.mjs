import test from "node:test";
import assert from "node:assert/strict";
import {
  normalizeWords,
  groupWords,
  cueAt,
  cuesToEditor,
  parseEditor,
  cuesToSrt,
} from "../shared/captions.mjs";
import { renderSchema } from "../server/validation.mjs";

test("transcription discards untimed or empty words and bounds real word times to the clip", () => {
  const words = normalizeWords(
    [
      { text: "[Music]", timestamp: [0, 1] },
      { text: "hello", timestamp: [1, 2] },
      { text: "late", timestamp: [9, 11] },
      { text: "missing", timestamp: [null, null] },
      { text: "zero", timestamp: [4, 4] },
    ],
    10,
  );
  assert.deepEqual(words, [
    { text: "hello", start: 1, end: 2 },
    { text: "late", start: 9, end: 10 },
  ]);
});
test("captions break on vocal pauses and disappear in gaps", () => {
  const cues = groupWords([
    { text: "Hello", start: 0, end: 0.5 },
    { text: "world", start: 0.5, end: 1 },
    { text: "again", start: 2, end: 2.5 },
  ]);
  assert.equal(cues.length, 2);
  assert.equal(cueAt(cues, 1.5), undefined);
  assert.equal(cueAt(cues, 2.2).text, "again");
});
test("caption editor keeps original word timing until a phrase is changed", () => {
  const cues = groupWords([
    { text: "Hello", start: 0, end: 0.51 },
    { text: "world", start: 0.6, end: 1 },
  ]);
  assert.deepEqual(parseEditor(cuesToEditor(cues), 5, cues), cues);
  assert.equal(
    parseEditor("0 --> 1 | New lyrics", 5, cues)[0].words,
    undefined,
  );
});
test("caption editor rejects overlaps, invalid syntax, and out-of-clip subtitles", () => {
  for (const input of [
    "bad",
    "0 --> 9 | late",
    "2 --> 1 | reversed",
    "0 --> 2 | one\n1 --> 3 | two",
  ])
    assert.throws(() => parseEditor(input, 5));
});
test("SRT times are relative to the selected clip", () => {
  assert.match(
    cuesToSrt([{ start: 1.25, end: 2.5, text: "Hello" }]),
    /00:00:01,250 --> 00:00:02,500/,
  );
});
test("render API rejects subtitle timing errors independently of the editor", () => {
  const input = {
    trackId: "310b3a1c-9693-4a5e-9eec-c3da41060270",
    start: 0,
    duration: 5,
  };
  assert.equal(
    renderSchema.safeParse({
      ...input,
      captions: [{ start: 2, end: 7, text: "late" }],
    }).success,
    false,
  );
  assert.equal(
    renderSchema.safeParse({
      ...input,
      captions: [
        {
          start: 0,
          end: 1,
          text: "hello",
          words: [{ start: 2, end: 3, text: "hello" }],
        },
      ],
    }).success,
    false,
  );
});
