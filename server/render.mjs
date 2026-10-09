import { spawn } from "node:child_process";
import { mkdir, rename, rm, writeFile, copyFile } from "node:fs/promises";
import path from "node:path";
import { createCanvas, loadImage } from "./canvas.mjs";
import { ffmpegPath, FPS } from "./config.mjs";
import { getTrack, readJson, trackDir, renderDir } from "./storage.mjs";
import { validateClip } from "./validation.mjs";
import {
  drawFrame,
  clipWaveform,
  WIDTH,
  HEIGHT,
} from "../shared/composition.mjs";
import { probe } from "./media.mjs";
import { totalDuration } from "../shared/timeline.mjs";
import { cuesToSrt } from "../shared/captions.mjs";
import { videoDescription } from "./description.mjs";

export async function renderVideo(id, options, report, signal) {
  const track = await getTrack(options.trackId);
  validateClip(options, track);
  const directory = renderDir(id);
  await mkdir(directory, { recursive: true });
  const temporary = path.join(directory, "rendering.mp4");
  const output = path.join(directory, "soundcloud-finds.mp4");
  const analysis = await readJson(
    path.join(trackDir(track.id), "analysis.json"),
  );
  const art = track.hasArtwork
    ? await loadImage(path.join(trackDir(track.id), "artwork.jpg"))
    : null;
  const wave = clipWaveform(analysis, options.start, options.duration);
  const canvas = createCanvas(WIDTH, HEIGHT),
    ctx = canvas.getContext("2d");
  const videoDuration = totalDuration(options.duration, options.branded);
  const count = Math.ceil(videoDuration * FPS);
  const audioFilter = `atrim=duration=${options.duration},asetpts=PTS-STARTPTS,apad=whole_dur=${videoDuration}`;
  const args = [
    "-y",
    "-v",
    "error",
    "-f",
    "rawvideo",
    "-pixel_format",
    "rgba",
    "-video_size",
    `${WIDTH}x${HEIGHT}`,
    "-framerate",
    String(FPS),
    "-i",
    "pipe:0",
    "-ss",
    String(options.start),
    "-i",
    path.join(trackDir(track.id), "audio.mp3"),
    "-map",
    "0:v:0",
    "-map",
    "1:a:0",
    "-af",
    audioFilter,
    "-t",
    String(videoDuration),
    "-c:v",
    "libx264",
    "-preset",
    "veryfast",
    "-crf",
    "20",
    "-threads",
    "4",
    "-pix_fmt",
    "yuv420p",
    "-c:a",
    "aac",
    "-b:a",
    "192k",
    "-ar",
    "48000",
    "-movflags",
    "+faststart",
    "-metadata",
    `title=${track.title} | SoundCloud Finds`,
    temporary,
  ];
  const encoder = spawn(ffmpegPath, args, {
    windowsHide: true,
    shell: false,
    stdio: ["pipe", "ignore", "pipe"],
  });
  let errorText = "",
    failure;
  encoder.stderr.on("data", (chunk) => {
    errorText = (errorText + chunk).slice(-3000);
  });
  encoder.on("error", (error) => {
    failure = error;
  });
  encoder.stdin.on("error", (error) => {
    failure ||= error;
  });
  const done = new Promise((resolve) =>
    encoder.on("close", (code) => resolve(code)),
  );
  const abort = () => {
    failure = new Error("Cancelled.");
    encoder.kill();
  };
  signal.addEventListener("abort", abort, { once: true });
  const timeout = setTimeout(
    () => {
      failure = new Error("Rendering exceeded 20 minutes.");
      encoder.kill();
    },
    20 * 60 * 1000,
  );
  try {
    for (let i = 0; i < count; i++) {
      signal.throwIfAborted();
      if (failure || encoder.exitCode !== null)
        throw (
          failure ||
          new Error(errorText || "Video encoder stopped unexpectedly.")
        );
      drawFrame(ctx, { track, art, analysis, wave, ...options, time: i / FPS });
      if (i === Math.min(30, count - 1))
        await writeFile(
          path.join(directory, "poster.jpg"),
          await canvas.encode("jpeg", 90),
        );
      const frame = canvas.data();
      await new Promise((resolve, reject) =>
        encoder.stdin.write(frame, (error) =>
          error ? reject(error) : resolve(),
        ),
      );
      if (i % 15 === 0)
        report(
          Math.round(5 + (i / count) * 88),
          `Rendering frame ${i + 1} of ${count}…`,
        );
    }
    encoder.stdin.end();
    const code = await done;
    if (failure || code !== 0)
      throw failure || new Error(errorText || "Video encoding failed.");
    report(96, "Checking the finished MP4…");
    const info = await probe(temporary, signal);
    const video = info.streams.find((stream) => stream.codec_type === "video");
    const audio = info.streams.find((stream) => stream.codec_type === "audio");
    if (
      video?.width !== WIDTH ||
      video?.height !== HEIGHT ||
      video?.codec_name !== "h264" ||
      audio?.codec_name !== "aac"
    )
      throw new Error("The encoded video did not pass output validation.");
    await rename(temporary, output);
    const description = videoDescription(track, options);
    await writeFile(
      path.join(directory, "description.txt"),
      description,
      "utf8",
    );
    await writeFile(
      path.join(directory, "lyrics.srt"),
      cuesToSrt(options.captions || []),
      "utf8",
    );
    if (track.hasArtwork)
      await copyFile(
        path.join(trackDir(track.id), "artwork.jpg"),
        path.join(directory, "cover-art.jpg"),
      );
    return {
      videoUrl: `/api/renders/${id}/video`,
      downloadUrl: `/api/renders/${id}/download`,
      posterUrl: `/api/renders/${id}/poster`,
      descriptionUrl: `/api/renders/${id}/description`,
      captionsUrl: `/api/renders/${id}/captions`,
      artworkUrl: track.hasArtwork ? `/api/renders/${id}/artwork` : null,
      description,
      width: WIDTH,
      height: HEIGHT,
      fps: FPS,
      duration: videoDuration,
      clipDuration: options.duration,
      title: track.title,
      artist: track.artist,
    };
  } catch (error) {
    encoder.kill();
    await done;
    await rm(temporary, { force: true });
    throw error;
  } finally {
    clearTimeout(timeout);
    signal.removeEventListener("abort", abort);
  }
}
