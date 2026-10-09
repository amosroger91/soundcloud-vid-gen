export function normalizeWords(chunks, duration) {
  return (chunks || [])
    .flatMap((chunk) => {
      const text = String(chunk.text || "")
        .replace(/[\u0000-\u001f\u200b-\u200f\u202a-\u202e]/g, "")
        .trim();
      const [start, end] = chunk.timestamp || [];
      if (
        !text ||
        /^[♪♫\s]+$/.test(text) ||
        /^\[(music|silence|applause|instrumental)\]$/i.test(text)
      )
        return [];
      if (
        !Number.isFinite(start) ||
        !Number.isFinite(end) ||
        end <= start ||
        start >= duration ||
        end <= 0
      )
        return [];
      return [
        { text, start: Math.max(0, start), end: Math.min(duration, end) },
      ];
    })
    .sort((a, b) => a.start - b.start);
}
export function groupWords(words) {
  const cues = [];
  let group = [];
  const flush = () => {
    if (group.length)
      cues.push({
        start: group[0].start,
        end: group.at(-1).end,
        text: group.map((word) => word.text).join(" "),
        words: group,
      });
    group = [];
  };
  for (const word of words) {
    if (
      group.length &&
      (group.length >= 5 ||
        word.start - group.at(-1).end > 0.65 ||
        word.end - group[0].start > 3.5 ||
        [...group, word].map((word) => word.text).join(" ").length > 44)
    )
      flush();
    group.push(word);
    if (/[.!?]$/.test(word.text)) flush();
  }
  flush();
  return cues;
}
export const cueAt = (cues, time) =>
  cues?.find((cue) => time >= cue.start && time < cue.end);
export function lyricPresentation(cues, time) {
  const cue = cueAt(cues, time);
  if (!cue) return { visible: false, cue: null, words: [], activeWord: null };
  const words = cueWords(cue);
  return {
    visible: true,
    cue,
    words,
    activeWord:
      words.find((word) => time >= word.start && time < word.end) || null,
  };
}
function lyricToken(text) {
  return String(text)
    .toLowerCase()
    .normalize("NFKC")
    .replace(/[^\p{L}\p{N}']+/gu, "");
}
function median(values) {
  if (!values.length) return null;
  const sorted = [...values].sort((a, b) => a - b);
  const mid = Math.floor(sorted.length / 2);
  return sorted.length % 2
    ? sorted[mid]
    : (sorted[mid - 1] + sorted[mid]) / 2;
}
// Scores heard words against a reference you timed by ear.
// Onset bias is heard start minus reference start, in milliseconds.
// Positive bias means the lyric is late. WER counts substitutions, deletions, and insertions.
export function scoreLyricSync(hypothesis, reference) {
  const hyp = (hypothesis || [])
    .map((word) => ({ ...word, token: lyricToken(word.text) }))
    .filter((word) => word.token);
  const ref = (reference || [])
    .map((word) => ({ ...word, token: lyricToken(word.text) }))
    .filter((word) => word.token);
  const cost = Array.from({ length: hyp.length + 1 }, () =>
    new Uint16Array(ref.length + 1),
  );
  const step = Array.from({ length: hyp.length + 1 }, () =>
    new Uint8Array(ref.length + 1),
  );
  for (let i = 1; i <= hyp.length; i++) {
    cost[i][0] = i;
    step[i][0] = 2;
  }
  for (let j = 1; j <= ref.length; j++) {
    cost[0][j] = j;
    step[0][j] = 3;
  }
  for (let i = 1; i <= hyp.length; i++) {
    for (let j = 1; j <= ref.length; j++) {
      const substitution =
        cost[i - 1][j - 1] + (hyp[i - 1].token === ref[j - 1].token ? 0 : 1);
      const insertion = cost[i - 1][j] + 1;
      const deletion = cost[i][j - 1] + 1;
      let best = substitution;
      let direction = 1;
      if (insertion < best) {
        best = insertion;
        direction = 2;
      }
      if (deletion < best) {
        best = deletion;
        direction = 3;
      }
      cost[i][j] = best;
      step[i][j] = direction;
    }
  }
  let substitutions = 0,
    insertions = 0,
    deletions = 0,
    i = hyp.length,
    j = ref.length;
  const onsetMs = [];
  while (i > 0 || j > 0) {
    const direction = step[i][j];
    if (direction === 1) {
      if (hyp[i - 1].token === ref[j - 1].token)
        onsetMs.push((hyp[i - 1].start - ref[j - 1].start) * 1000);
      else substitutions++;
      i--;
      j--;
    } else if (direction === 2) {
      insertions++;
      i--;
    } else {
      deletions++;
      j--;
    }
  }
  const errors = substitutions + insertions + deletions;
  const within = (limit) =>
    onsetMs.length
      ? onsetMs.filter((value) => Math.abs(value) <= limit).length /
        onsetMs.length
      : null;
  return {
    wer: ref.length === 0 ? (hyp.length === 0 ? 0 : 1) : errors / ref.length,
    substitutions,
    insertions,
    deletions,
    matched: onsetMs.length,
    hypothesisCount: hyp.length,
    referenceCount: ref.length,
    meanSignedOnsetMs: onsetMs.length
      ? onsetMs.reduce((sum, value) => sum + value, 0) / onsetMs.length
      : null,
    medianAbsOnsetMs: median(onsetMs.map((value) => Math.abs(value))),
    within200: within(200),
    within400: within(400),
  };
}
export function cueWords(cue) {
  if (cue.words?.length) return cue.words;
  const words = cue.text.trim().split(/\s+/);
  return words.map((text, index) => ({
    text,
    start: cue.start + ((cue.end - cue.start) * index) / words.length,
    end: cue.start + ((cue.end - cue.start) * (index + 1)) / words.length,
  }));
}
export function cuesToEditor(cues) {
  return cues
    .map(
      (cue) =>
        `${cue.start.toFixed(2)} --> ${cue.end.toFixed(2)} | ${cue.text}`,
    )
    .join("\n");
}
export function parseEditor(value, duration, previous = []) {
  const cues = value
    .split("\n")
    .filter((line) => line.trim())
    .map((line, index) => {
      const match = line.match(
        /^\s*(\d+(?:\.\d+)?)\s*-->\s*(\d+(?:\.\d+)?)\s*\|\s*(.+?)\s*$/,
      );
      if (!match)
        throw new Error(
          `Caption line ${index + 1}: use start --> end | lyrics (seconds into this clip).`,
        );
      const cue = {
        start: Number(match[1]),
        end: Number(match[2]),
        text: match[3],
      };
      if (
        cue.end <= cue.start ||
        cue.end > duration + 0.01 ||
        cue.text.length > 120
      )
        throw new Error(
          `Caption line ${index + 1}: check the times and keep the line under 120 characters.`,
        );
      const original = previous.find(
        (item) =>
          Math.abs(item.start - cue.start) < 0.011 &&
          Math.abs(item.end - cue.end) < 0.011 &&
          item.text === cue.text,
      );
      return original || cue;
    });
  if (cues.length > 200) throw new Error("Use no more than 200 caption lines.");
  for (let i = 1; i < cues.length; i++)
    if (cues[i].start < cues[i - 1].end - 0.01)
      throw new Error(
        `Caption line ${i + 1}: captions must be ordered and must not overlap.`,
      );
  return cues;
}
const srtTime = (value) => {
  const ms = Math.round(value * 1000);
  return `${String(Math.floor(ms / 3600000)).padStart(2, "0")}:${String(Math.floor(ms / 60000) % 60).padStart(2, "0")}:${String(Math.floor(ms / 1000) % 60).padStart(2, "0")},${String(ms % 1000).padStart(3, "0")}`;
};
export const cuesToSrt = (cues) =>
  cues
    .map(
      (cue, index) =>
        `${index + 1}\n${srtTime(cue.start)} --> ${srtTime(cue.end)}\n${cue.text}\n`,
    )
    .join("\n");
