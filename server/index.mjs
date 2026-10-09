import express from "express";
import path from "node:path";
import { createApp } from "./app.mjs";
import { root, port, host } from "./config.mjs";

const { app, jobs } = await createApp();
let vite;
if (process.argv.includes("--dev")) {
  const { createServer } = await import("vite");
  vite = await createServer({
    root,
    server: { middlewareMode: true },
    appType: "spa",
  });
  app.use(vite.middlewares);
} else {
  app.use(express.static(path.join(root, "dist")));
  app.get("/{*path}", (_req, res) =>
    res.sendFile(path.join(root, "dist/index.html")),
  );
}
const server = app.listen(port, host, () =>
  console.log(`SoundCloud Finds is ready at http://${host}:${port}`),
);
async function shutdown() {
  await jobs.stop();
  await vite?.close();
  server.close();
}
process.on("SIGINT", shutdown);
process.on("SIGTERM", shutdown);
