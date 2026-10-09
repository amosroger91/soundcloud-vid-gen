import { mkdir, writeFile } from "node:fs/promises";
import path from "node:path";
import { root } from "../server/config.mjs";
import { logoSvg, drawLogo } from "../shared/logo.mjs";
import { createCanvas } from "../server/canvas.mjs";
const directory = path.join(root, "assets", "brand");
await mkdir(directory, { recursive: true });
await writeFile(path.join(directory, "soundcloud-finds.svg"), logoSvg());
const canvas = createCanvas(800, 740);
drawLogo(canvas.getContext("2d"), { x: 400, y: 300 });
await writeFile(
  path.join(directory, "soundcloud-finds.png"),
  await canvas.encode("png"),
);
console.log("Original logo assets saved to assets/brand.");
