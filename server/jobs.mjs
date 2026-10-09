import { fork } from "node:child_process";
import { randomUUID } from "node:crypto";
import { mkdir, readdir } from "node:fs/promises";
import path from "node:path";
import { root, dataDir } from "./config.mjs";
import { readJson, saveJson } from "./storage.mjs";

const terminal = new Set(["complete", "failed", "cancelled"]);
export class Jobs {
  constructor({
    directory = path.join(dataDir, "jobs"),
    workerFactory = () =>
      fork(path.join(root, "server/worker.mjs"), [], {
        windowsHide: true,
        stdio: ["ignore", "ignore", "pipe", "ipc"],
      }),
  } = {}) {
    this.directory = directory;
    this.workerFactory = workerFactory;
  }
  jobs = new Map();
  writes = new Map();
  active = null;
  stopping = false;
  async init() {
    const directory = this.directory;
    await mkdir(directory, { recursive: true });
    for (const file of await readdir(directory)) {
      if (!file.endsWith(".json")) continue;
      const job = await readJson(path.join(directory, file)).catch(() => null);
      if (!job) continue;
      if (!terminal.has(job.status)) {
        job.status = "failed";
        job.error =
          "The server restarted before this job finished. Please try again.";
        await this.save(job);
      }
      this.jobs.set(job.id, job);
    }
  }
  save(job) {
    const snapshot = structuredClone(job);
    const pending = (this.writes.get(job.id) || Promise.resolve())
      .catch(() => {})
      .then(() =>
        saveJson(path.join(this.directory, `${job.id}.json`), snapshot),
      );
    this.writes.set(job.id, pending);
    return pending;
  }
  list() {
    return [...this.jobs.values()]
      .sort((a, b) => b.createdAt.localeCompare(a.createdAt))
      .slice(0, 30);
  }
  async add(type, input = {}) {
    if (
      [...this.jobs.values()].filter((job) => !terminal.has(job.status))
        .length >= 8
    )
      throw Object.assign(
        new Error("The queue is full. Wait for a job to finish."),
        { status: 429 },
      );
    const job = {
      id: randomUUID(),
      type,
      input,
      status: "queued",
      progress: 0,
      message: "Waiting for the media worker…",
      createdAt: new Date().toISOString(),
    };
    this.jobs.set(job.id, job);
    try {
      await this.save(job);
    } catch (error) {
      this.jobs.delete(job.id);
      throw error;
    }
    this.pump();
    return job;
  }
  pump() {
    if (this.active || this.stopping) return;
    const job = [...this.jobs.values()].find((job) => job.status === "queued");
    if (!job) return;
    job.status = "running";
    const child = this.workerFactory();
    this.active = { job, child };
    this.save(job).catch(console.error);
    let workerError = "";
    child.stderr.on("data", (chunk) => {
      workerError = (workerError + chunk).slice(-600);
    });
    child.on("error", (error) => {
      workerError = error.message;
    });
    child.on("message", (message) => {
      if (terminal.has(job.status)) return;
      if (message.type === "progress") {
        job.progress = message.progress;
        job.message = message.message;
      }
      if (message.type === "complete") {
        job.status = "complete";
        job.progress = 100;
        job.result = message.result;
        job.message = "Ready.";
      }
      if (message.type === "failed") {
        job.status = "failed";
        job.error = message.error;
      }
      this.save(job).catch(console.error);
    });
    child.on("exit", () => {
      if (!terminal.has(job.status)) {
        job.status = "failed";
        job.error = workerError || "The media worker stopped unexpectedly.";
        this.save(job).catch(console.error);
      }
      this.active = null;
      this.pump();
    });
    child.send({ type: "start", job });
    const timeout = setTimeout(
      () => {
        if (terminal.has(job.status)) return;
        job.status = "failed";
        job.error = "The job exceeded 20 minutes. Try a shorter clip.";
        child.send({ type: "cancel" });
        if (job.type === "transcribe") child.kill();
        this.save(job).catch(console.error);
      },
      20 * 60 * 1000,
    );
    child.once("exit", () => clearTimeout(timeout));
  }
  async cancel(id) {
    const job = this.jobs.get(id);
    if (!job || terminal.has(job.status)) return job;
    job.status = "cancelled";
    job.message = "Cancelled.";
    if (this.active?.job.id === id) {
      this.active.child.send({ type: "cancel" });
      // Native inference can be busy in ONNX; terminating this isolated worker cancels it immediately.
      if (job.type === "transcribe") this.active.child.kill();
    }
    await this.save(job);
    return job;
  }
  async stop() {
    this.stopping = true;
    if (this.active) await this.cancel(this.active.job.id);
    await Promise.all([...this.writes.values()]);
  }
}
