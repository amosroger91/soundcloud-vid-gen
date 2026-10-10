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

test("automatic nested words and punctuation boundaries produce valid non-overlapping captions", () => {
  const chunks = [
    { text: "These", timestamp: [27.2, 29.8] },
    { text: "words.", timestamp: [28, 28.6] },
    { text: "Cross", timestamp: [28.4, 30.8] },
    { text: "the", timestamp: [28.4, 29.1] },
    { text: "boundary.", timestamp: [29, 30] },
    { text: "Final", timestamp: [179.6, 181] },
    { text: "line.", timestamp: [179.8, 180] },
  ];
  const original = structuredClone(chunks);
  const words = normalizeWords(chunks, 180);
  const captions = groupWords(words);
  assert.deepEqual(words.map((word) => word.text), chunks.map((word) => word.text));
  assert.deepEqual(chunks, original, "normalization must not mutate the transcript");
  assert.equal(words[0].end, 28);
  assert.equal(words[1].end, 28.4);
  assert.equal(words.at(-1).end, 180);
  words.forEach((word, index) => {
    assert.ok(word.end > word.start);
    if (index) assert.ok(word.start >= words[index - 1].end);
  });
  assert.doesNotThrow(() => renderSchema.parse({
    trackId: "310b3a1c-9693-4a5e-9eec-c3da41060270", start: 0, duration: 180, captions,
  }));
});

test("tied onsets crossing caption boundaries keep every word, including repeated lyrics", () => {
  const text = ["Go", "go", "go", "keep", "on", "moving"];
  const words = normalizeWords([
    ...text.map((text) => ({ text, timestamp: [75, 77] })),
    { text: "again", timestamp: [76.5, 78] },
  ], 90);
  assert.deepEqual(words.map((word) => word.text), [...text, "again"]);
  assert.equal(words[0].start, 75);
  assert.equal(words[5].end, 76.5);
  words.forEach((word, index) => {
    assert.ok(word.end > word.start);
    if (index) assert.equal(word.start, words[index - 1].end);
  });
  const captions = groupWords(words);
  assert.ok(captions.length > 1);
  assert.doesNotThrow(() => renderSchema.parse({
    trackId: "310b3a1c-9693-4a5e-9eec-c3da41060270", start: 0, duration: 90, captions,
  }));
});

test("reconciling automatic timings leaves valid word times and vocal gaps unchanged", () => {
  const words = [
    { text: "First", start: 1.125, end: 1.75 },
    { text: "line.", start: 1.75, end: 2.25 },
    { text: "Later", start: 75.125, end: 75.5 },
  ];
  assert.deepEqual(normalizeWords(words.map(({ text, start, end }) => ({
    text, timestamp: [start, end],
  })), 90), words);
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
