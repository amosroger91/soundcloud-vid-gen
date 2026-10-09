import { spawn } from "node:child_process";

export function run(
  file,
  args,
  {
    signal,
    timeout = 180000,
    maxBytes = 20 * 1024 * 1024,
    binary = false,
  } = {},
) {
  return new Promise((resolve, reject) => {
    const child = spawn(file, args, {
      windowsHide: true,
      shell: false,
      stdio: ["ignore", "pipe", "pipe"],
    });
    const chunks = [];
    let bytes = 0;
    let errorText = "";
    let failure;
    const stop = (error) => {
      failure ||= error;
      child.kill();
    };
    const abort = () => stop(new Error("Cancelled."));
    const timer = setTimeout(
      () =>
        stop(
          new Error("The media command timed out. Please try a shorter track."),
        ),
      timeout,
    );
    signal?.addEventListener("abort", abort, { once: true });
    if (signal?.aborted) abort();
    child.stdout.on("data", (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes)
        stop(new Error("Media output exceeded the size limit."));
      else chunks.push(chunk);
    });
    child.stderr.on("data", (chunk) => {
      errorText = (errorText + chunk.toString()).slice(-4000);
    });
    child.on("error", (error) => {
      failure = error;
    });
    child.on("close", (code) => {
      clearTimeout(timer);
      signal?.removeEventListener("abort", abort);
      if (failure) return reject(failure);
      if (code !== 0)
        return reject(
          new Error(
            errorText.trim() || `Media command exited with code ${code}.`,
          ),
        );
      const buffer = Buffer.concat(chunks);
      resolve(binary ? buffer : buffer.toString("utf8"));
    });
  });
}
