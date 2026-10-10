import { importTrack, createDemo } from "./media.mjs";
import { renderVideo } from "./render.mjs";
import { generateVideo } from "./generate.mjs";
import { rm } from "node:fs/promises";
import path from "node:path";
import { trackDir, renderDir } from "./storage.mjs";

const controller = new AbortController();
process.on("message", async (message) => {
  if (message.type === "cancel") {
    controller.abort();
    return;
  }
  if (message.type !== "start") return;
  const { job } = message;
  const report = (progress, message, stage) =>
    process.send?.({ type: "progress", progress, message, stage });
  try {
    const result =
      job.type === "import"
        ? await importTrack(job.id, job.input.url, report, controller.signal)
        : job.type === "transcribe"
          ? await (
              await import("./transcribe.mjs")
            ).transcribeTrack(job.input, report, controller.signal)
          : job.type === "demo"
            ? await createDemo(job.id, report, controller.signal)
            : job.type === "tiktok"
              ? await (
                  await import("./tiktok.mjs")
                ).uploadDraft(
                  path.join(renderDir(job.input.renderId), "soundcloud-finds.mp4"),
                  report,
                  controller.signal,
                )
              : job.type === "generate"
                ? await generateVideo(job.id, job.input, report, controller.signal)
                : await renderVideo(job.id, job.input, report, controller.signal);
    controller.signal.throwIfAborted();
    process.send?.({ type: "complete", result }, () => process.disconnect());
  } catch (error) {
    if (!["transcribe", "tiktok"].includes(job.type))
      await rm(["render", "generate"].includes(job.type) ? renderDir(job.id) : trackDir(job.id), {
        recursive: true,
        force: true,
      }).catch(() => {});
    process.send?.(
      {
        type: "failed",
        error: controller.signal.aborted
          ? "Cancelled."
          : String(error.message).slice(0, 600),
      },
      () => process.disconnect(),
    );
  }
});
