import "dotenv/config";
import {
  mkdir,
  writeFile,
  chmod,
  copyFile,
  access,
  readFile,
} from "node:fs/promises";
import path from "node:path";
import { createHash } from "node:crypto";
import {
  runtimeDir,
  root,
  ffmpegPath,
  ffprobePath,
  ytdlpPath,
} from "../server/config.mjs";

async function download(url) {
  const response = await fetch(url, { signal: AbortSignal.timeout(180000) });
  if (!response.ok)
    throw new Error(`Download failed (${response.status}): ${url}`);
  return Buffer.from(await response.arrayBuffer());
}
await mkdir(runtimeDir, { recursive: true });
const ext = process.platform === "win32" ? ".exe" : "";
const hash = (buffer) => createHash("sha256").update(buffer).digest("hex");
async function copyIfChanged(source, target) {
  const [original, existing] = await Promise.all([
    readFile(source),
    readFile(target).catch(() => null),
  ]);
  if (!existing || hash(original) !== hash(existing))
    await copyFile(source, target);
}
await copyIfChanged(ffmpegPath, path.join(runtimeDir, `ffmpeg${ext}`));
await copyIfChanged(ffprobePath, path.join(runtimeDir, `ffprobe${ext}`));
if (!process.env.YTDLP_PATH) {
  const names = {
    "win32-x64": "yt-dlp.exe",
    "win32-arm64": "yt-dlp_arm64.exe",
    "darwin-x64": "yt-dlp_macos",
    "darwin-arm64": "yt-dlp_macos",
    "linux-x64": "yt-dlp_linux",
    "linux-arm64": "yt-dlp_linux_aarch64",
  };
  const name = names[`${process.platform}-${process.arch}`];
  if (!name)
    throw new Error(
      "Install yt-dlp manually and set YTDLP_PATH for this platform.",
    );
  let version = process.env.YTDLP_VERSION;
  if (!version) {
    const release = JSON.parse(
      (
        await download(
          "https://api.github.com/repos/yt-dlp/yt-dlp/releases/latest",
        )
      ).toString(),
    );
    version = release.tag_name;
  }
  if (!/^[\w.-]+$/.test(version))
    throw new Error("Invalid yt-dlp release version.");
  console.log(`Installing official yt-dlp ${version} (${name})...`);
  const base = `https://github.com/yt-dlp/yt-dlp/releases/download/${version}`;
  const [binary, sums] = await Promise.all([
    download(`${base}/${name}`),
    download(`${base}/SHA2-256SUMS`),
  ]);
  const expected = sums
    .toString()
    .split("\n")
    .map((line) => line.trim().split(/\s+/))
    .find(([, file]) => file?.replace(/^\*/, "") === name)?.[0];
  if (
    !expected ||
    createHash("sha256").update(binary).digest("hex") !== expected
  )
    throw new Error("yt-dlp checksum verification failed.");
  const existing = await readFile(ytdlpPath).catch(() => null);
  if (!existing || hash(existing) !== expected)
    await writeFile(ytdlpPath, binary);
  await chmod(ytdlpPath, 0o755);
  await writeFile(path.join(runtimeDir, "version.txt"), version);
} else {
  await access(ytdlpPath);
}

const fonts = path.join(root, "assets", "fonts");
await mkdir(fonts, { recursive: true });
for (const [file, url] of [
  [
    "Montserrat.ttf",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/Montserrat%5Bwght%5D.ttf",
  ],
  [
    "OFL-Montserrat.txt",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/montserrat/OFL.txt",
  ],
  [
    "CormorantGaramond.ttf",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/CormorantGaramond%5Bwght%5D.ttf",
  ],
  [
    "OFL-CormorantGaramond.txt",
    "https://raw.githubusercontent.com/google/fonts/main/ofl/cormorantgaramond/OFL.txt",
  ],
  ...["Regular", "Medium", "SemiBold", "Bold", "ExtraBold"].map((weight) => [
    `Montserrat-${weight}.ttf`,
    `https://raw.githubusercontent.com/JulietaUla/Montserrat/master/fonts/ttf/Montserrat-${weight}.ttf`,
  ]),
]) {
  try {
    await access(path.join(fonts, file));
  } catch {
    await writeFile(path.join(fonts, file), await download(url));
  }
}
console.log("Media tools and fonts are ready. Run npm run dev.");
