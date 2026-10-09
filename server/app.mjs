import express from "express";
import path from "node:path";
import { access } from "node:fs/promises";
import { ZodError } from "zod";
import { Jobs } from "./jobs.mjs";
import { getTrack, trackDir, renderDir } from "./storage.mjs";
import {
  importSchema,
  renderSchema,
  transcribeSchema,
  uuidSchema,
  validateClip,
} from "./validation.mjs";
import {
  ytdlpPath,
  ffmpegPath,
  ffprobePath,
  host,
  runtimeDir,
} from "./config.mjs";

export async function createApp({ jobs = new Jobs() } = {}) {
  await jobs.init();
  const app = express();
  app.disable("x-powered-by");
  app.use((req, res, next) => {
    const allowed = new Set(["localhost", "127.0.0.1", "[::1]", host]);
    if (!allowed.has(req.hostname))
      return res
        .status(403)
        .json({ error: "This app accepts local requests only." });
    res.set("X-Content-Type-Options", "nosniff");
    res.set("Referrer-Policy", "no-referrer");
    const origin = req.get("origin");
    if (
      origin &&
      !["GET", "HEAD"].includes(req.method) &&
      origin !== `${req.protocol}://${req.get("host")}`
    )
      return res
        .status(403)
        .json({ error: "Cross-origin requests are not allowed." });
    next();
  });
  app.use(express.json({ limit: "256kb" }));
  app.get("/api/health", async (_req, res) => {
    const available = async (file) =>
      access(file).then(
        () => true,
        () => false,
      );
    const tools = {
      downloader: await available(ytdlpPath),
      ffmpeg: await available(ffmpegPath),
      ffprobe: await available(ffprobePath),
      importRuntime: await available(
        path.join(
          runtimeDir,
          process.platform === "win32" ? "ffmpeg.exe" : "ffmpeg",
        ),
      ),
    };
    res.json({ ok: true, ready: Object.values(tools).every(Boolean), tools });
  });
  app.get("/api/jobs", (_req, res) => res.json(jobs.list()));
  app.get("/api/jobs/:id", (req, res) => {
    const job = jobs.jobs.get(uuidSchema.parse(req.params.id));
    if (!job) return res.status(404).json({ error: "Job not found." });
    res.json(job);
  });
  app.post("/api/jobs/:id/cancel", async (req, res) => {
    const job = await jobs.cancel(uuidSchema.parse(req.params.id));
    if (!job) return res.status(404).json({ error: "Job not found." });
    res.json(job);
  });
  app.post("/api/imports", async (req, res) =>
    res
      .status(202)
      .json(await jobs.add("import", importSchema.parse(req.body))),
  );
  app.post("/api/demo", async (_req, res) =>
    res.status(202).json(await jobs.add("demo")),
  );
  app.post("/api/transcriptions", async (req, res) => {
    const options = transcribeSchema.parse(req.body);
    const track = await getTrack(options.trackId);
    try {
      validateClip(options, track);
    } catch (error) {
      error.status = 400;
      throw error;
    }
    res.status(202).json(await jobs.add("transcribe", options));
  });
  app.post("/api/renders", async (req, res) => {
    const options = renderSchema.parse(req.body);
    const track = await getTrack(options.trackId);
    try {
      validateClip(options, track);
    } catch (error) {
      error.status = 400;
      throw error;
    }
    res.status(202).json(await jobs.add("render", options));
  });
  app.get("/api/tracks/:id", async (req, res) =>
    res.json(await getTrack(req.params.id)),
  );
  for (const [route, file] of [
    ["audio", "audio.mp3"],
    ["artwork", "artwork.jpg"],
    ["analysis", "analysis.json"],
  ]) {
    app.get(`/api/tracks/:id/${route}`, async (req, res) => {
      await getTrack(req.params.id);
      res.sendFile(path.join(trackDir(req.params.id), file));
    });
  }
  for (const [route, file] of [
    ["video", "soundcloud-finds.mp4"],
    ["download", "soundcloud-finds.mp4"],
    ["poster", "poster.jpg"],
    ["description", "description.txt"],
    ["captions", "lyrics.srt"],
    ["artwork", "cover-art.jpg"],
  ]) {
    app.get(`/api/renders/:id/${route}`, (req, res) => {
      const job = jobs.jobs.get(uuidSchema.parse(req.params.id));
      if (job?.type !== "render" || job.status !== "complete")
        return res.status(404).json({ error: "This video is not ready." });
      const target = path.join(renderDir(req.params.id), file);
      if (route === "download")
        res.download(
          target,
          `soundcloud-finds-${req.params.id.slice(0, 8)}.mp4`,
        );
      else if (["description", "captions", "artwork"].includes(route))
        res.download(target, file);
      else res.sendFile(target);
    });
  }
  app.use("/api", (_req, res) =>
    res.status(404).json({ error: "Endpoint not found." }),
  );
  app.use((error, _req, res, _next) => {
    if (error instanceof ZodError)
      return res
        .status(400)
        .json({ error: error.issues[0]?.message || "Invalid request." });
    if (error.code === "ENOENT")
      return res.status(404).json({ error: "Track or file not found." });
    if (error.type === "entity.parse.failed")
      return res.status(400).json({ error: "Invalid JSON." });
    if (error.status && error.status < 500)
      return res.status(error.status).json({ error: error.message });
    console.error(error);
    res
      .status(500)
      .json({
        error:
          "The server could not complete the request. Check the terminal for details.",
      });
  });
  return { app, jobs };
}
