import { chromium } from "playwright";
import assert from "node:assert/strict";
import path from "node:path";
import { mkdir, writeFile } from "node:fs/promises";
import { root } from "../server/config.mjs";

const directory = path.join(root, "test-results");
await mkdir(directory, { recursive: true });
const browser = await chromium.launch({
  channel: process.platform === "win32" ? "chrome" : undefined,
  headless: true,
});
try {
  const page = await browser.newPage({
    viewport: { width: 1440, height: 1100 },
    deviceScaleFactor: 1,
  });
  const errors = [];
  page.on("pageerror", (error) => errors.push(error.message));
  await page.goto(process.env.APP_URL || "http://127.0.0.1:4317");
  await page.evaluate(() => document.fonts.ready);
  await page.screenshot({
    path: path.join(directory, "studio-empty.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Try a demo" }).click();
  await page
    .getByRole("button", { name: /^Generate video/ })
    .waitFor({ timeout: 120000 });
  await page
    .locator(".track-card")
    .getByText("After Hours", { exact: true })
    .waitFor();
  await page.getByRole("button", { name: "Ice palette" }).click();
  assert.equal(
    await page
      .getByRole("button", { name: "Ice palette" })
      .getAttribute("aria-pressed"),
    "true",
  );
  await page.getByRole("button", { name: "Ember palette" }).click();
  await page
    .getByRole("spinbutton", { name: "Clip length in seconds" })
    .fill("8");
  await page.getByRole("spinbutton", { name: "Start in seconds" }).fill("4");
  await page.getByRole("button", { name: "Generate lyrics" }).click();
  await page
    .getByText("The demo track is instrumental.", { exact: false })
    .waitFor({ timeout: 60000 });
  await page.locator(".caption-editor summary").click();
  await page
    .locator("#captions")
    .fill(
      "0.30 --> 2.40 | Caption timing test\n5.80 --> 7.80 | A little more listening",
    );
  await page.getByRole("button", { name: "Apply lyrics" }).click();
  await page.getByRole("button", { name: "Play preview", exact: true }).click();
  await page.waitForFunction(
    () => document.querySelector("audio").currentTime > 4.6,
  );
  await page
    .getByRole("button", { name: "Pause preview", exact: true })
    .click();
  assert.ok(await page.locator("audio").evaluate((audio) => audio.paused));
  await page.screenshot({
    path: path.join(directory, "studio-desktop.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Intro", exact: true }).click();
  await page.screenshot({
    path: path.join(directory, "preview-intro.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Outro", exact: true }).click();
  await page.screenshot({
    path: path.join(directory, "preview-outro.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Thank you", exact: true }).click();
  await page.screenshot({
    path: path.join(directory, "preview-thanks.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Music", exact: true }).click();
  await page.getByRole("button", { name: "Play preview", exact: true }).click();
  await page.waitForFunction(
    () =>
      Number(document.querySelector('[aria-label="Preview timeline"]').value) >
      14.1,
    { timeout: 20000 },
  );
  await page
    .getByRole("button", { name: "Play preview", exact: true })
    .waitFor();
  const stoppedAudio = await page
    .locator("audio")
    .evaluate((audio) => ({ paused: audio.paused, time: audio.currentTime }));
  assert.ok(
    stoppedAudio.paused && stoppedAudio.time >= 12 && stoppedAudio.time < 12.25,
    "Music must stop at the selected clip boundary while the silent ending plays.",
  );
  await page.setViewportSize({ width: 390, height: 844 });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
  );
  await page.screenshot({
    path: path.join(directory, "studio-mobile.png"),
    fullPage: true,
  });
  await page.setViewportSize({ width: 1440, height: 1100 });
  await page.getByRole("button", { name: /^Generate video/ }).click();
  const videoDownload = page
    .locator(".preview-section")
    .getByRole("link", { name: "Download MP4", exact: true });
  await videoDownload.waitFor({ timeout: 240000 });
  const downloadUrl = await videoDownload.getAttribute("href");
  const response = await page.request.get(
    new URL(downloadUrl, page.url()).href,
  );
  assert.equal(response.status(), 200);
  assert.ok(response.headers()["content-type"].includes("video/mp4"));
  assert.ok(Number(response.headers()["content-length"]) > 100000);
  await page.locator("video").evaluate(async (video) => {
    await video.play();
  });
  await page.waitForFunction(
    () => document.querySelector("video").currentTime > 0.2,
  );
  await page.locator("video").evaluate((video) => video.pause());
  assert.deepEqual(
    await page
      .locator("video")
      .evaluate((video) => [video.videoWidth, video.videoHeight]),
    [1080, 1920],
  );
  assert.ok(
    Math.abs(
      (await page.locator("video").evaluate((video) => video.duration)) - 14.2,
    ) < 0.15,
  );
  assert.match(await page.locator("#description").inputValue(), /Finds Studio/);
  const descriptionUrl = await page
    .getByRole("link", { name: "Save .txt" })
    .getAttribute("href");
  assert.match(
    await (
      await page.request.get(new URL(descriptionUrl, page.url()).href)
    ).text(),
    /Cover art:/,
  );
  const captionsUrl = await page
    .getByRole("link", { name: "Subtitles .srt" })
    .getAttribute("href");
  assert.match(
    await (
      await page.request.get(new URL(captionsUrl, page.url()).href)
    ).text(),
    /00:00:00,300 --> 00:00:02,400/,
  );
  await page.screenshot({
    path: path.join(directory, "studio-export.png"),
    fullPage: true,
  });
  await page.getByRole("button", { name: "Back to live preview" }).click();
  await page
    .getByRole("textbox", { name: "Song link", exact: true })
    .fill("https://example.com/song");
  await page.getByRole("button", { name: "Import track", exact: true }).click();
  await page
    .getByRole("alert")
    .filter({ hasText: "Only SoundCloud song links" })
    .waitFor();
  await page.reload();
  await page.getByText("After Hours", { exact: true }).first().waitFor();
  assert.deepEqual(errors, []);
  await writeFile(
    path.join(directory, "browser-report.json"),
    JSON.stringify(
      {
        passed: true,
        checks: [
          "demo import",
          "theme change",
          "clip selection",
          "preview audio",
          "mobile overflow",
          "instrumental transcription",
          "caption editing",
          "intro/outro/thank-you preview",
          "background render",
          "MP4 download",
          "1080x1920 playback",
          "full timeline duration",
          "artist/artwork description",
          "SRT sidecar",
          "invalid URL",
          "reload persistence",
        ],
        pageErrors: errors,
        downloadUrl,
      },
      null,
      2,
    ),
  );
  console.log(
    "Browser checks passed: desktop, mobile, audio preview, render, download, playback, validation, persistence.",
  );
} finally {
  await browser.close();
}
