import test from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import path from "node:path";

const data = await mkdtemp(path.join(tmpdir(), "finds-tiktok-"));
process.env.DATA_DIR = data;
process.env.TIKTOK_CLIENT_KEY = "test-key";
process.env.TIKTOK_CLIENT_SECRET = "test-secret";
const tiktok = await import("../server/tiktok.mjs");
const MB = 1024 * 1024;

test("plans chunks within TikTok's 5–64 MB rules", () => {
  assert.deepEqual(tiktok.planChunks(3 * MB), { chunkSize: 3 * MB, count: 1 });
  assert.deepEqual(tiktok.planChunks(7 * MB), { chunkSize: 7 * MB, count: 1 });
  assert.deepEqual(tiktok.planChunks(25 * MB), { chunkSize: 10 * MB, count: 2 });
});

test("builds a PKCE authorization URL for the registered redirect", () => {
  const url = new URL(tiktok.authorizationUrl());
  assert.equal(url.origin + url.pathname, "https://www.tiktok.com/v2/auth/authorize/");
  assert.equal(url.searchParams.get("client_key"), "test-key");
  assert.equal(url.searchParams.get("scope"), "user.info.basic,video.upload");
  assert.equal(url.searchParams.get("code_challenge_method"), "S256");
  assert.match(url.searchParams.get("code_challenge"), /^[0-9a-f]{64}$/);
  assert.equal(
    url.searchParams.get("redirect_uri"),
    "http://127.0.0.1:4317/api/tiktok/callback/",
  );
});

test("connects, then uploads a video to the inbox in ranged chunks", async () => {
  const calls = [];
  const realFetch = globalThis.fetch;
  let statusChecks = 0;
  globalThis.fetch = async (url, init = {}) => {
    const href = String(url);
    calls.push({ href, init });
    const json = (body) => new Response(JSON.stringify(body), { status: 200 });
    if (href.endsWith("/v2/oauth/token/"))
      return json({
        access_token: "access",
        refresh_token: "refresh",
        open_id: "open",
        scope: "user.info.basic,video.upload",
        expires_in: 86400,
        refresh_expires_in: 31536000,
      });
    if (href.includes("/v2/user/info/"))
      return json({ data: { user: { display_name: "finds" } } });
    if (href.endsWith("/inbox/video/init/"))
      return json({
        data: { publish_id: "p1", upload_url: "https://upload.test/u?x=1" },
        error: { code: "ok" },
      });
    if (href.startsWith("https://upload.test/"))
      return new Response(null, { status: 206 });
    if (href.endsWith("/status/fetch/"))
      return json({
        data: { status: ++statusChecks < 2 ? "PROCESSING_UPLOAD" : "SEND_TO_USER_INBOX" },
        error: { code: "ok" },
      });
    throw new Error(`Unexpected request ${href}`);
  };
  try {
    const state = new URL(tiktok.authorizationUrl()).searchParams.get("state");
    await assert.rejects(
      tiktok.completeAuthorization({ code: "c", state: "wrong" }),
      /expired/,
    );
    await tiktok.completeAuthorization({ code: "c", state });
    assert.deepEqual(
      { ...(await tiktok.tiktokStatus()), redirectUri: undefined },
      { configured: true, connected: true, displayName: "finds", redirectUri: undefined },
    );
    const tokenBody = calls.find((call) => call.href.endsWith("/oauth/token/")).init.body;
    assert.equal(tokenBody.get("grant_type"), "authorization_code");
    assert.ok(tokenBody.get("code_verifier"));

    await mkdir(path.join(data, "video"), { recursive: true });
    const file = path.join(data, "video", "clip.mp4");
    await writeFile(file, Buffer.alloc(12 * MB, 1));
    const progress = [];
    const result = await tiktok.uploadDraft(
      file,
      (value) => progress.push(value),
      new AbortController().signal,
      { pollMs: 1 },
    );
    assert.deepEqual(result, { publishId: "p1", status: "SEND_TO_USER_INBOX", inbox: true });
    const init = JSON.parse(calls.find((call) => call.href.endsWith("/init/")).init.body);
    assert.deepEqual(init.source_info, {
      source: "FILE_UPLOAD",
      video_size: 12 * MB,
      chunk_size: 10 * MB,
      total_chunk_count: 1,
    });
    const puts = calls.filter((call) => call.href.startsWith("https://upload.test/"));
    assert.equal(puts.length, 1);
    assert.equal(puts[0].init.headers["Content-Range"], `bytes 0-${12 * MB - 1}/${12 * MB}`);
    assert.equal(
      calls.find((call) => call.href.endsWith("/init/")).init.headers.Authorization,
      "Bearer access",
    );
    assert.ok(progress.at(-1) >= 80);

    await tiktok.disconnect();
    assert.equal((await tiktok.tiktokStatus()).connected, false);
  } finally {
    globalThis.fetch = realFetch;
  }
});

test("surfaces TikTok API errors from init", async () => {
  const realFetch = globalThis.fetch;
  await writeFile(
    path.join(data, "tiktok", "token.json"),
    JSON.stringify({
      accessToken: "a",
      refreshToken: "r",
      expiresAt: Date.now() + 3600e3,
      refreshExpiresAt: Date.now() + 3600e3,
    }),
  );
  globalThis.fetch = async () =>
    new Response(
      JSON.stringify({ error: { code: "spam_risk_too_many_pending_share", message: "Too many pending drafts" } }),
      { status: 403 },
    );
  try {
    await assert.rejects(
      tiktok.uploadDraft(path.join(data, "video", "clip.mp4"), () => {}, new AbortController().signal),
      /Too many pending drafts/,
    );
  } finally {
    globalThis.fetch = realFetch;
  }
});
