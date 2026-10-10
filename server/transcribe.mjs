import path from "node:path";
import os from "node:os";
import { env, pipeline } from "@huggingface/transformers";
import { ffmpegPath, SAMPLE_RATE, MAX_TRACK_SECONDS } from "./config.mjs";
import { getTrack, trackDir } from "./storage.mjs";
import { validateClip } from "./validation.mjs";
import { run } from "./process.mjs";
import { normalizeWords, groupWords } from "../shared/captions.mjs";

export const modelName =
  process.env.WHISPER_MODEL || "onnx-community/whisper-base_timestamped";
// ONNX cannot reliably memory-map model files on Windows SMB drives.
env.cacheDir =
  process.env.MODEL_CACHE_DIR ||
  path.join(os.homedir(), ".cache", "soundcloud-vid-gen", "models");
env.allowLocalModels = false;
let engine;
export async function loadTranscriber(report = () => {}) {
  let last = 0;
  engine ||= pipeline("automatic-speech-recognition", modelName, {
    device: "cpu",
    dtype: { encoder_model: "fp32", decoder_model_merged: "q8" },
    session_options: { intraOpNumThreads: 4, interOpNumThreads: 1 },
    progress_callback: (event) => {
      if (Date.now() - last < 750) return;
      last = Date.now();
      report(
        10,
        event.status === "progress"
          ? `Downloading speech model: ${Math.round(event.progress || 0)}%…`
          : "Loading the local speech model…",
      );
    },
  });
  try {
    return await engine;
  } catch (error) {
    engine = null;
    throw error;
  }
}

export async function transcribeAudio(
  file,
  { start, duration, language = "auto" },
  report,
  signal,
  dependencies = {},
) {
  if (!Number.isFinite(duration) || duration <= 0 || duration > MAX_TRACK_SECONDS)
    throw new Error("Choose a song up to 10 minutes long.");
  report(3, "Preparing audio for lyric transcription…");
  // Seek after the input so the clip starts on the exact sample. A leading seek can begin early and shift every word.
  const raw = await run(
    ffmpegPath,
    [
      "-v",
      "error",
      "-i",
      file,
      "-ss",
      String(start),
      "-t",
      String(duration),
      "-vn",
      "-ac",
      "1",
      "-ar",
      String(SAMPLE_RATE),
      "-f",
      "f32le",
      "pipe:1",
    ],
    {
      signal,
      binary: true,
      // PCM uses four bytes per sample. Include a second for decoder padding.
      maxBytes: Math.ceil((duration + 1) * SAMPLE_RATE) * 4,
    },
  );
  const samples = Float32Array.from({ length: raw.length / 4 }, (_, index) =>
    raw.readFloatLE(index * 4),
  );
  const rms = Math.sqrt(
    samples.reduce((sum, value) => sum + value * value, 0) /
      Math.max(1, samples.length),
  );
  if (rms < 0.001)
    return {
      cues: [],
      words: [],
      note: "No audible vocals were detected in this silent audio.",
    };
  const transcriber = await (dependencies.loadTranscriber || loadTranscriber)(report);
  signal.throwIfAborted();
  report(25, "Listening for lyrics and aligning words…");
  const output = await transcriber(samples, {
    return_timestamps: "word",
    chunk_length_s: 29,
    stride_length_s: 5,
    task: "transcribe",
    ...(language !== "auto" ? { language } : {}),
  });
  signal.throwIfAborted();
  const words = normalizeWords(output.chunks, duration).filter((word) => {
    const first = Math.floor(word.start * SAMPLE_RATE),
      last = Math.min(samples.length, Math.ceil(word.end * SAMPLE_RATE));
    let energy = 0;
    for (let i = first; i < last; i++) energy += samples[i] ** 2;
    return last > first && Math.sqrt(energy / (last - first)) > 0.001;
  });
  report(95, "Arranging the lyric captions…");
  return {
    cues: groupWords(words),
    words,
    model: modelName,
    note: words.length
      ? "Automatic lyrics can mishear vocals over music. You can edit the words and timing, then regenerate the full video."
      : "No timed lyrics were found. You can add captions manually or leave this song instrumental.",
  };
}
export async function transcribeTrack(options, report, signal) {
  const track = await getTrack(options.trackId);
  validateClip(options, track);
  const result =
    track.source === "demo"
      ? {
          cues: [],
          words: [],
          note: "The demo track is instrumental. Add your own captions below, or import a song with vocals.",
        }
      : await transcribeAudio(
          path.join(trackDir(track.id), "audio.mp3"),
          options,
          report,
          signal,
        );
  return {
    ...result,
    trackId: track.id,
    start: options.start,
    duration: options.duration,
    language: options.language,
  };
}
