import { mkdir, readFile, writeFile, rename } from "node:fs/promises";
import path from "node:path";
import { dataDir } from "./config.mjs";
import { uuidSchema } from "./validation.mjs";

export const trackDir = (id) =>
  path.join(dataDir, "tracks", uuidSchema.parse(id));
export const renderDir = (id) =>
  path.join(dataDir, "renders", uuidSchema.parse(id));
export async function saveJson(file, value) {
  await mkdir(path.dirname(file), { recursive: true });
  await writeFile(`${file}.tmp`, JSON.stringify(value));
  await rename(`${file}.tmp`, file);
}
export const readJson = async (file) =>
  JSON.parse(await readFile(file, "utf8"));
export const getTrack = (id) => readJson(path.join(trackDir(id), "track.json"));
