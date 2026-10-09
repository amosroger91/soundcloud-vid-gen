import "dotenv/config";
import path from "node:path";
import { fileURLToPath } from "node:url";
import ffmpeg from "ffmpeg-static";
import ffprobe from "ffprobe-static";

export const root = path.resolve(
  path.dirname(fileURLToPath(import.meta.url)),
  "..",
);
export const dataDir = path.resolve(
  process.env.DATA_DIR || path.join(root, "data"),
);
export const runtimeDir = path.join(root, ".runtime");
export const ffmpegPath = process.env.FFMPEG_PATH || ffmpeg;
export const ffprobePath = process.env.FFPROBE_PATH || ffprobe.path;
export const ytdlpPath =
  process.env.YTDLP_PATH ||
  path.join(runtimeDir, process.platform === "win32" ? "yt-dlp.exe" : "yt-dlp");
export const host = process.env.HOST || "127.0.0.1";
export const port = Number(process.env.PORT || 4317);
export const FPS = 30;
export const SAMPLE_RATE = 16000;
export const MAX_TRACK_SECONDS = 600;
