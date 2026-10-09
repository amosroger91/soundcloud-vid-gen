import { mkdir, writeFile, access, rm, stat } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "./canvas.mjs";
import {
  ffmpegPath,
  ffprobePath,
  ytdlpPath,
  runtimeDir,
  MAX_TRACK_SECONDS,
} from "./config.mjs";
import { run } from "./process.mjs";
import { resolveSource } from "./validation.mjs";
import { trackDir, saveJson } from "./storage.mjs";
import { analyzeAudio } from "./analysis.mjs";

export async function probe(file, signal) {
  return JSON.parse(
    await run(
      ffprobePath,
      ["-v", "error", "-show_format", "-show_streams", "-of", "json", file],
      { signal },
    ),
  );
}

async function artwork(url, directory, signal) {
  if (!url) return false;
  const address = new URL(url);
  if (
    address.protocol !== "https:" ||
    !/(^|\.)sndcdn\.com$/.test(address.hostname) ||
    address.port ||
    address.username ||
    address.password
  )
    return false;
  const response = await fetch(address, {
    redirect: "error",
    signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
  });
  if (
    !response.ok ||
    Number(response.headers.get("content-length")) > 10_000_000
  ) {
    await response.body?.cancel();
    return false;
  }
  const chunks = [];
  let length = 0;
  for await (const chunk of response.body) {
    length += chunk.length;
    if (length > 10_000_000) throw new Error("Artwork exceeds the size limit.");
    chunks.push(chunk);
  }
  const image = await loadImage(Buffer.concat(chunks));
  const canvas = createCanvas(1000, 1000);
  const side = Math.min(image.width, image.height);
  canvas
    .getContext("2d")
    .drawImage(
      image,
      (image.width - side) / 2,
      (image.height - side) / 2,
      side,
      side,
      0,
      0,
      1000,
      1000,
    );
  await writeFile(
    path.join(directory, "artwork.jpg"),
    await canvas.encode("jpeg", 92),
  );
  return true;
}

export async function finishTrack(id, metadata, report, signal) {
  const directory = trackDir(id);
  const file = path.join(directory, "audio.mp3");
  const details = await probe(file, signal);
  const duration = Number(details.format.duration);
  if (
    !Number.isFinite(duration) ||
    duration < 3 ||
    duration > MAX_TRACK_SECONDS + 1
  )
    throw new Error("Choose a track between 3 seconds and 10 minutes.");
  if ((await stat(file)).size > 100_000_000)
    throw new Error("Track exceeds the 100 MB limit.");
  report(65, "Analyzing the waveform and frequency spectrum…");
  const analysis = await analyzeAudio(file, signal);
  await saveJson(path.join(directory, "analysis.json"), analysis);
  const track = {
    id,
    ...metadata,
    duration: Math.min(duration, analysis.duration),
    createdAt: new Date().toISOString(),
    audioUrl: `/api/tracks/${id}/audio`,
    artworkUrl: metadata.hasArtwork ? `/api/tracks/${id}/artwork` : null,
    analysisUrl: `/api/tracks/${id}/analysis`,
  };
  await saveJson(path.join(directory, "track.json"), track);
  return track;
}

export async function importTrack(id, source, report, signal) {
  const directory = trackDir(id);
  await mkdir(directory, { recursive: true });
  try {
    try {
      await access(ytdlpPath);
      await access(
        path.join(
          runtimeDir,
          process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
        ),
      );
    } catch {
      throw new Error(
        "Media tools are missing. Run npm run setup in the project folder, then try again.",
      );
    }
    report(5, "Resolving the SoundCloud song…");
    const url = await resolveSource(source, signal);
    const common = [
      "--ignore-config",
      "--no-playlist",
      "--no-warnings",
      "--no-progress",
      "--socket-timeout",
      "20",
      "--retries",
      "2",
      "--use-extractors",
      "^Soundcloud$",
    ];
    const info = JSON.parse(
      await run(
        ytdlpPath,
        [...common, "--dump-single-json", "--skip-download", "--", url],
        { signal, timeout: 90000 },
      ),
    );
    if (
      info._type === "playlist" ||
      info.entries ||
      !info.duration ||
      info.duration > MAX_TRACK_SECONDS ||
      info.duration < 3
    )
      throw new Error("Choose a single song between 3 seconds and 10 minutes.");
    if (
      info.is_live ||
      info.availability === "premium_only" ||
      info.availability === "subscriber_only"
    )
      throw new Error("This song is not publicly available.");
    report(20, "Downloading the audio…");
    await run(
      ytdlpPath,
      [
        ...common,
        "--format",
        "bestaudio",
        "--max-filesize",
        "100M",
        "--extract-audio",
        "--audio-format",
        "mp3",
        "--audio-quality",
        "0",
        "--ffmpeg-location",
        runtimeDir,
        "--output",
        path.join(directory, "audio.%(ext)s"),
        "--",
        url,
      ],
      { signal, timeout: 300000 },
    );
    report(55, "Fetching the cover art…");
    let hasArtwork = false;
    try {
      hasArtwork = await artwork(info.thumbnail, directory, signal);
    } catch {
      signal.throwIfAborted();
    }
    return await finishTrack(
      id,
      {
        title: String(info.track || info.title || "Untitled").slice(0, 200),
        artist: String(info.artist || info.uploader || "Unknown artist").slice(
          0,
          120,
        ),
        album: info.album ? String(info.album).slice(0, 200) : null,
        sourceUrl: url,
        hasArtwork,
        artworkSourceUrl: hasArtwork ? info.thumbnail : null,
        source: "soundcloud",
        artworkNote: hasArtwork
          ? null
          : "No downloadable cover was available; using the generated cover.",
      },
      report,
      signal,
    );
  } catch (error) {
    await rm(directory, { recursive: true, force: true });
    if (
      /HTTP Error|unable to extract|not available|403|401|404|Unable to download/i.test(
        error.message,
      )
    )
      throw new Error(
        "SoundCloud could not provide this song. It may be private, restricted, removed, or temporarily unavailable. Try another public link, or run npm run setup to update the importer.",
      );
    throw error;
  }
}

export async function createDemo(id, report, signal) {
  const directory = trackDir(id);
  await mkdir(directory, { recursive: true });
  report(10, "Synthesizing the demo track…");
  // Original procedural audio: three changing chords, bass, kick, and a light hi-hat.
  const sampleRate = 44100,
    duration = 45;
  const pcm = Buffer.alloc(sampleRate * duration * 2);
  const chords = [
    [220, 261.63, 329.63],
    [174.61, 220, 261.63],
    [196, 246.94, 293.66],
  ];
  let seed = 716;
  for (let i = 0; i < sampleRate * duration; i++) {
    const t = i / sampleRate,
      beat = t % 0.5;
    const chord = chords[Math.floor(t / 4) % chords.length];
    const pad =
      chord.reduce(
        (sum, frequency) => sum + Math.sin(t * frequency * Math.PI * 2),
        0,
      ) / 3;
    const kick =
      Math.sin(2 * Math.PI * (48 * beat + 9 * (1 - Math.exp(-30 * beat)))) *
      Math.exp(-beat * 17);
    seed = (seed * 1664525 + 1013904223) >>> 0;
    const hat = ((seed / 0xffffffff) * 2 - 1) * Math.exp(-(t % 0.25) * 110);
    const bass = Math.sin(((t * chord[0]) / 4) * Math.PI * 2);
    const fade = Math.min(1, t / 0.3, (duration - t) / 0.7);
    const value = (pad * 0.24 + kick * 0.34 + hat * 0.05 + bass * 0.18) * fade;
    pcm.writeInt16LE(
      Math.max(-32767, Math.min(32767, Math.round(value * 32767))),
      i * 2,
    );
  }
  const rawFile = path.join(directory, "demo.pcm");
  await writeFile(rawFile, pcm);
  await run(
    ffmpegPath,
    [
      "-y",
      "-v",
      "error",
      "-f",
      "s16le",
      "-ar",
      String(sampleRate),
      "-ac",
      "1",
      "-i",
      rawFile,
      "-c:a",
      "libmp3lame",
      "-b:a",
      "192k",
      path.join(directory, "audio.mp3"),
    ],
    { signal },
  );
  await rm(rawFile);
  const canvas = createCanvas(1000, 1000),
    ctx = canvas.getContext("2d");
  const gradient = ctx.createLinearGradient(0, 0, 850, 1000);
  gradient.addColorStop(0, "#fd936d");
  gradient.addColorStop(0.48, "#825875");
  gradient.addColorStop(1, "#101d31");
  ctx.fillStyle = gradient;
  ctx.fillRect(0, 0, 1000, 1000);
  for (let i = 0; i < 30; i++) {
    ctx.strokeStyle = `rgba(255, 214, 186, ${0.25 + i / 90})`;
    ctx.lineWidth = 2;
    ctx.beginPath();
    ctx.ellipse(470, 470, 95 + i * 13, 190 + i * 11, -0.6, 0, Math.PI * 2);
    ctx.stroke();
  }
  ctx.fillStyle = "#ffffff";
  ctx.font = "800 110px Montserrat";
  ctx.fillText("AFTER", 72, 760);
  ctx.fillText("HOURS", 72, 875);
  ctx.font = "500 22px Montserrat";
  ctx.fillText("FINDS STUDIO  /  ORIGINAL SYNTH DEMO", 78, 945);
  await writeFile(
    path.join(directory, "artwork.jpg"),
    await canvas.encode("jpeg", 95),
  );
  return finishTrack(
    id,
    {
      title: "After Hours",
      artist: "Finds Studio",
      sourceUrl: null,
      source: "demo",
      hasArtwork: true,
      artworkNote: null,
    },
    report,
    signal,
  );
}
