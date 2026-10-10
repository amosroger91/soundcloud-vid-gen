import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { root } from "../server/config.mjs";

const directory = path.join(root, "test-results");
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({ channel: process.platform === "win32" ? "chrome" : undefined, headless: true });
try {
  const page = await browser.newPage({ viewport: { width: 1440, height: 1100 } });
  const errors = [], submissions = [], manualSteps = [];
  page.on("pageerror", (error) => errors.push(error.message));
  page.on("request", (request) => {
    if (request.method() === "POST" && /\/api\/(renders|transcriptions)$/.test(request.url()))
      manualSteps.push(request.url());
  });
  // Test the real URL-button workflow using our original instrumental demo
  // instead of a third-party download or speech-model download.
  await page.route("**/api/health", (route) => route.fulfill({
    json: { ok: true, ready: true, tools: { downloader: true, ffmpeg: true, ffprobe: true, importRuntime: true } },
  }));
  await page.route("**/api/videos", async (route) => {
    const input = route.request().postDataJSON();
    submissions.push(input);
    assert.equal(input.start, undefined);
    assert.equal(input.duration, undefined);
    assert.equal(input.captions, undefined);
    const { url, ...settings } = input;
    assert.equal(url, "https://soundcloud.com/artist/whole-song");
    await route.continue({ postData: JSON.stringify({ ...settings, demo: true }) });
  });
  await page.goto(process.env.APP_URL || "http://127.0.0.1:4317");
  await page.evaluate(() => document.fonts.ready);
  assert.equal(await page.getByRole("button", { name: /^Generate lyrics$/ }).count(), 0);
  assert.equal(await page.getByRole("spinbutton", { name: "Clip length in seconds" }).count(), 0);
  await page.getByRole("textbox", { name: "Song link", exact: true }).fill("https://soundcloud.com/artist/whole-song");
  await page.locator(".customize-panel > summary").click();
  await page.getByRole("checkbox", { name: "Animated intro, outro & thank-you ending" }).check();
  await page.locator(".customize-panel > summary").click();
  await page.getByRole("button", { name: "Generate full video", exact: true }).click();
  await page.locator(".job-progress").waitFor();
  assert.equal(await page.getByRole("link", { name: /Download/ }).count(), 0);
  await page.reload();
  await page.locator(".job-progress").waitFor();
  const download = page.getByRole("link", { name: "Download full video", exact: true });
  await download.waitFor({ timeout: 360000 });
  assert.equal(submissions.length, 1, "one click must schedule the entire workflow");
  assert.deepEqual(manualSteps, [], "browser must not schedule separate lyric/render requests");
  assert.equal(await page.getByRole("link", { name: /Download/ }).count(), 1);
  const href = await download.getAttribute("href");
  const response = await page.request.get(new URL(href, page.url()).href);
  assert.equal(response.status(), 200);
  assert.ok(Number(response.headers()["content-length"]) > 100000);
  await page.locator("video").evaluate((video) => new Promise((resolve) => {
    if (video.readyState >= 1) resolve(); else video.addEventListener("loadedmetadata", resolve, { once: true });
  }));
  const media = await page.locator("video").evaluate((video) => ({
    duration: video.duration, width: video.videoWidth, height: video.videoHeight,
  }));
  assert.deepEqual([media.width, media.height], [1080, 1920]);
  assert.ok(Math.abs(media.duration - 51.2) < 0.15, `whole demo plus branding must be 51.2s, got ${media.duration}`);
  assert.match(await page.locator("#description").inputValue(), /Finds Studio/);
  await page.screenshot({ path: path.join(directory, "full-song-desktop.png"), fullPage: true });
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth));
  await page.screenshot({ path: path.join(directory, "full-song-mobile.png"), fullPage: true });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.locator(".customize-panel > summary").click();
  await page.getByRole("button", { name: "Remix visuals", exact: true }).click();
  await page.locator(".video-stage canvas").waitFor();
  assert.equal(await download.count(), 0, "live previews must have no download link");
  await page.getByRole("radio", { name: "Drift", exact: true }).check();
  assert.ok(await page.getByRole("radio", { name: "Drift", exact: true }).isChecked());
  await page.locator(".caption-editor > summary").click();
  await page.locator("#captions").fill("41 --> 43 | Near the end of the song");
  await page.getByRole("button", { name: "Apply lyrics", exact: true }).click();
  assert.equal(await download.count(), 0);
  await page.getByRole("button", { name: "Update full video", exact: true }).waitFor();
  await page.reload();
  await download.waitFor();
  assert.equal(await download.getAttribute("href"), href, "reload must restore the completed full video");
  assert.equal(await page.getByRole("link", { name: /Download/ }).count(), 1);
  assert.deepEqual(errors, []);
  await writeFile(path.join(directory, "browser-report.json"), JSON.stringify({
    passed: true, checks: ["single URL submission", "automatic full-song pipeline", "reload during generation", "one full-length download", "no preview downloads", "45-second source plus ending", "mobile layout", "optional edits", "reload finished result"],
    media, submissions: submissions.length, pageErrors: errors,
  }, null, 2));
  console.log("Browser checks passed: one-click full song, automatic lyrics stage, reload recovery, single download, mobile, optional editing.");
} finally {
  await browser.close();
}
