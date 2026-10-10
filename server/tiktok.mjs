import { createHash, randomBytes } from "node:crypto";
import { open, rm, stat } from "node:fs/promises";
import path from "node:path";
import { dataDir, port } from "./config.mjs";
import { readJson, saveJson } from "./storage.mjs";

// TikTok Login Kit (desktop, PKCE) + Content Posting API in upload/inbox mode:
// the video lands in the creator's TikTok inbox as a draft to finish in the app.
const AUTH_URL = "https://www.tiktok.com/v2/auth/authorize/";
const API = "https://open.tiktokapis.com";
const SCOPES = "user.info.basic,video.upload";
const MB = 1024 * 1024;
const tokenFile = () => path.join(dataDir, "tiktok", "token.json");

export const tiktokConfig = () => ({
  clientKey: process.env.TIKTOK_CLIENT_KEY?.trim() || "",
  clientSecret: process.env.TIKTOK_CLIENT_SECRET?.trim() || "",
  redirectUri:
    process.env.TIKTOK_REDIRECT_URI?.trim() ||
    `http://127.0.0.1:${port}/api/tiktok/callback/`,
});
const configured = () => {
  const { clientKey, clientSecret } = tiktokConfig();
  return Boolean(clientKey && clientSecret);
};

// TikTok's desktop flow expects the hex-encoded SHA-256 of the verifier.
export const pkceChallenge = (verifier) =>
  createHash("sha256").update(verifier).digest("hex");

const pending = new Map();
export function authorizationUrl() {
  if (!configured())
    throw Object.assign(
      new Error("Add TIKTOK_CLIENT_KEY and TIKTOK_CLIENT_SECRET to .env, then restart."),
      { status: 400 },
    );
  const now = Date.now();
  for (const [key, value] of pending)
    if (value.expires < now) pending.delete(key);
  const state = randomBytes(16).toString("hex");
  const verifier = randomBytes(48).toString("base64url");
  pending.set(state, { verifier, expires: now + 10 * 60 * 1000 });
  const { clientKey, redirectUri } = tiktokConfig();
  const url = new URL(AUTH_URL);
  url.search = new URLSearchParams({
    client_key: clientKey,
    scope: SCOPES,
    response_type: "code",
    redirect_uri: redirectUri,
    state,
    code_challenge: pkceChallenge(verifier),
    code_challenge_method: "S256",
  });
  return url.href;
}

async function tokenRequest(params) {
  const { clientKey, clientSecret } = tiktokConfig();
  const response = await fetch(`${API}/v2/oauth/token/`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      client_key: clientKey,
      client_secret: clientSecret,
      ...params,
    }),
    signal: AbortSignal.timeout(20000),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || json.error || !json.access_token)
    throw new Error(
      `TikTok sign-in failed: ${json.error_description || json.error || response.status}`,
    );
  const now = Date.now();
  const token = {
    accessToken: json.access_token,
    refreshToken: json.refresh_token,
    openId: json.open_id,
    scope: json.scope,
    expiresAt: now + json.expires_in * 1000,
    refreshExpiresAt: now + json.refresh_expires_in * 1000,
  };
  const previous = await readToken();
  token.displayName = previous?.displayName;
  await saveJson(tokenFile(), token);
  return token;
}

export async function completeAuthorization({ code, state, error }) {
  const entry = pending.get(state);
  pending.delete(state);
  if (error) throw new Error(`TikTok authorization was declined (${error}).`);
  if (!entry || entry.expires < Date.now())
    throw new Error("The TikTok sign-in link expired. Try connecting again.");
  const { redirectUri } = tiktokConfig();
  const token = await tokenRequest({
    code,
    grant_type: "authorization_code",
    redirect_uri: redirectUri,
    code_verifier: entry.verifier,
  });
  if (!token.scope?.split(",").includes("video.upload"))
    throw new Error(
      "TikTok did not grant the video.upload permission. Check the app's scopes and try again.",
    );
  const name = await displayName(token.accessToken).catch(() => null);
  if (name) await saveJson(tokenFile(), { ...token, displayName: name });
  return token;
}

const readToken = () => readJson(tokenFile()).catch(() => null);

async function accessToken() {
  const token = await readToken();
  if (!token || token.refreshExpiresAt < Date.now())
    throw new Error("Connect your TikTok account first.");
  if (token.expiresAt - Date.now() > 5 * 60 * 1000) return token.accessToken;
  return (
    await tokenRequest({
      grant_type: "refresh_token",
      refresh_token: token.refreshToken,
    })
  ).accessToken;
}

async function displayName(accessToken) {
  const response = await fetch(
    `${API}/v2/user/info/?fields=open_id,display_name`,
    {
      headers: { Authorization: `Bearer ${accessToken}` },
      signal: AbortSignal.timeout(15000),
    },
  );
  const json = await response.json();
  return json.data?.user?.display_name || null;
}

export async function tiktokStatus() {
  const token = await readToken();
  const connected = Boolean(token && token.refreshExpiresAt > Date.now());
  return {
    configured: configured(),
    connected,
    displayName: connected ? token.displayName || null : null,
    redirectUri: tiktokConfig().redirectUri,
  };
}

export async function disconnect() {
  const token = await readToken();
  if (token && configured()) {
    const { clientKey, clientSecret } = tiktokConfig();
    await fetch(`${API}/v2/oauth/revoke/`, {
      method: "POST",
      headers: { "Content-Type": "application/x-www-form-urlencoded" },
      body: new URLSearchParams({
        client_key: clientKey,
        client_secret: clientSecret,
        token: token.accessToken,
      }),
      signal: AbortSignal.timeout(15000),
    }).catch(() => {});
  }
  await rm(tokenFile(), { force: true });
}

// Chunks must be 5–64 MB; the final chunk absorbs the remainder (up to 128 MB).
// Files under 5 MB go up whole.
export function planChunks(size, preferred = 10 * MB) {
  if (size < 5 * MB) return { chunkSize: size, count: 1 };
  const chunkSize = Math.min(Math.max(preferred, 5 * MB), 64 * MB, size);
  return { chunkSize, count: Math.floor(size / chunkSize) };
}

async function postJson(endpoint, accessToken, body, signal) {
  const response = await fetch(`${API}${endpoint}`, {
    method: "POST",
    headers: {
      Authorization: `Bearer ${accessToken}`,
      "Content-Type": "application/json; charset=UTF-8",
    },
    body: JSON.stringify(body),
    signal: AbortSignal.any([signal, AbortSignal.timeout(30000)]),
  });
  const json = await response.json().catch(() => ({}));
  if (!response.ok || (json.error?.code && json.error.code !== "ok"))
    throw new Error(
      `TikTok: ${json.error?.message || json.error?.code || `HTTP ${response.status}`}`,
    );
  return json.data;
}

export async function uploadDraft(file, report, signal, { pollMs = 3000 } = {}) {
  const token = await accessToken();
  const { size } = await stat(file);
  const { chunkSize, count } = planChunks(size);
  report(5, "Starting the TikTok upload…");
  const { publish_id: publishId, upload_url: uploadUrl } = await postJson(
    "/v2/post/publish/inbox/video/init/",
    token,
    {
      source_info: {
        source: "FILE_UPLOAD",
        video_size: size,
        chunk_size: chunkSize,
        total_chunk_count: count,
      },
    },
    signal,
  );
  const handle = await open(file, "r");
  try {
    for (let i = 0; i < count; i++) {
      const start = i * chunkSize;
      const end = i === count - 1 ? size - 1 : start + chunkSize - 1;
      const buffer = Buffer.alloc(end - start + 1);
      await handle.read(buffer, 0, buffer.length, start);
      const response = await fetch(uploadUrl, {
        method: "PUT",
        headers: {
          "Content-Type": "video/mp4",
          "Content-Length": String(buffer.length),
          "Content-Range": `bytes ${start}-${end}/${size}`,
        },
        body: buffer,
        signal: AbortSignal.any([signal, AbortSignal.timeout(5 * 60 * 1000)]),
      });
      await response.body?.cancel();
      if (!response.ok)
        throw new Error(`TikTok rejected upload chunk ${i + 1} (HTTP ${response.status}).`);
      report(
        10 + Math.round(((i + 1) / count) * 70),
        `Uploaded ${i + 1} of ${count} part${count === 1 ? "" : "s"} to TikTok…`,
      );
    }
  } finally {
    await handle.close();
  }
  // The status endpoint allows 30 requests per minute; check for up to ~2 minutes.
  for (let attempt = 0; attempt < 40; attempt++) {
    signal.throwIfAborted();
    const data = await postJson(
      "/v2/post/publish/status/fetch/",
      token,
      { publish_id: publishId },
      signal,
    );
    if (data.status === "FAILED")
      throw new Error(`TikTok could not process the video: ${data.fail_reason || "unknown reason"}.`);
    if (["SEND_TO_USER_INBOX", "PUBLISH_COMPLETE"].includes(data.status))
      return { publishId, status: data.status, inbox: true };
    report(85, "TikTok is processing the video…");
    await new Promise((resolve) => setTimeout(resolve, pollMs));
  }
  return { publishId, status: "PROCESSING", inbox: false };
}
