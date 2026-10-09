import FFT from "fft.js";
import { run } from "./process.mjs";
import { FPS, SAMPLE_RATE, ffmpegPath, MAX_TRACK_SECONDS } from "./config.mjs";

const SIZE = 2048;
const BANDS = 56;
export function analyzeSamples(samples, sampleRate = SAMPLE_RATE, fps = FPS) {
  const fft = new FFT(SIZE);
  const input = new Float64Array(SIZE);
  const spectrum = fft.createComplexArray();
  const duration = samples.length / sampleRate;
  const frames = [];
  const waveform = [];
  const window = Float64Array.from(
    { length: SIZE },
    (_, i) => 0.5 * (1 - Math.cos((2 * Math.PI * i) / (SIZE - 1))),
  );
  for (let frame = 0; frame < Math.ceil(duration * fps); frame++) {
    const center = Math.floor((frame * sampleRate) / fps);
    let square = 0,
      peak = 0;
    for (let i = 0; i < SIZE; i++) {
      const value = samples[center + i - SIZE / 2] || 0;
      input[i] = value * window[i];
      square += value * value;
      peak = Math.max(peak, Math.abs(value));
    }
    fft.realTransform(spectrum, input);
    let weighted = 0,
      total = 0;
    for (let i = 1; i < SIZE / 2; i++) {
      const magnitude = Math.hypot(spectrum[2 * i], spectrum[2 * i + 1]);
      weighted += (magnitude * i * sampleRate) / SIZE;
      total += magnitude;
    }
    const bands = Array.from({ length: BANDS }, (_, band) => {
      const low = Math.max(
        1,
        Math.floor((40 * Math.pow(180, band / BANDS) * SIZE) / sampleRate),
      );
      const high = Math.min(
        SIZE / 2 - 1,
        Math.max(
          low + 1,
          Math.floor(
            (40 * Math.pow(180, (band + 1) / BANDS) * SIZE) / sampleRate,
          ),
        ),
      );
      let magnitude = 0;
      for (let i = low; i <= high; i++)
        magnitude = Math.max(
          magnitude,
          Math.hypot(spectrum[i * 2], spectrum[i * 2 + 1]) / (SIZE / 4),
        );
      return (
        Math.round(
          Math.max(
            0,
            Math.min(1, (20 * Math.log10(Math.max(magnitude, 1e-6)) + 65) / 65),
          ) * 1000,
        ) / 1000
      );
    });
    frames.push({
      bands,
      rms: Math.max(
        -60,
        Math.round(20 * Math.log10(Math.max(Math.sqrt(square / SIZE), 0.001))),
      ),
      centroid: Math.round(total ? weighted / total : 0),
      peak: Math.round(peak * 1000) / 1000,
    });
  }
  // Whole-track envelope at 100 points / second supports precise clip previews.
  for (
    let from = 0;
    from < samples.length;
    from += Math.round(sampleRate / 100)
  ) {
    let peak = 0;
    for (
      let i = from;
      i < Math.min(samples.length, from + Math.round(sampleRate / 100));
      i++
    )
      peak = Math.max(peak, Math.abs(samples[i]));
    waveform.push(Math.round(peak * 1000) / 1000);
  }
  return { duration, fps, sampleRate, waveformRate: 100, frames, waveform };
}

export async function analyzeAudio(file, signal) {
  const buffer = await run(
    ffmpegPath,
    [
      "-v",
      "error",
      "-i",
      file,
      "-vn",
      "-t",
      String(MAX_TRACK_SECONDS),
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
      maxBytes: SAMPLE_RATE * 4 * (MAX_TRACK_SECONDS + 1),
    },
  );
  const samples = new Float32Array(buffer.length / 4);
  for (let i = 0; i < samples.length; i++)
    samples[i] = buffer.readFloatLE(i * 4);
  if (!samples.length)
    throw new Error("The track contains no decodable audio.");
  return analyzeSamples(samples);
}
