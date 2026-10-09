import test from "node:test";
import assert from "node:assert/strict";
import {
  validateSource,
  renderSchema,
  validateClip,
} from "../server/validation.mjs";

test("normalizes SoundCloud tracks and strips tracking queries", () => {
  assert.equal(
    validateSource("https://www.soundcloud.com/artist/song?utm_source=share")
      .href,
    "https://soundcloud.com/artist/song",
  );
  assert.equal(
    validateSource("https://on.soundcloud.com/example").hostname,
    "on.soundcloud.com",
  );
});
test("rejects other sites, credentials, playlists, non-HTTPS, and host spoofing", () => {
  for (const url of [
    "file:///etc/passwd",
    "https://localhost/artist/song",
    "https://soundcloud.com.evil.test/a/b",
    "https://evil.test@localhost/a/b",
    "https://u:p@soundcloud.com/a/b",
    "http://soundcloud.com/a/b",
    "https://soundcloud.com:8080/a/b",
    "https://soundcloud.com/artist/sets/album",
    "https://soundcloud.com/artist",
    "--exec calc",
  ]) {
    assert.throws(() => validateSource(url), undefined, url);
  }
});
test("rejects invalid render lengths, IDs, themes and non-finite positions", () => {
  const input = {
    trackId: "310b3a1c-9693-4a5e-9eec-c3da41060270",
    start: 0,
    duration: 15,
  };
  assert.equal(renderSchema.parse(input).theme, "ember");
  for (const patch of [
    { duration: 61 },
    { duration: 0 },
    { start: -1 },
    { start: Infinity },
    { theme: "shell" },
    { trackId: "../data" },
    { episode: "<x>" },
  ]) {
    assert.equal(renderSchema.safeParse({ ...input, ...patch }).success, false);
  }
});
test("rejects clips beyond source duration", () => {
  assert.throws(() =>
    validateClip({ start: 21, duration: 10 }, { duration: 30 }),
  );
  assert.doesNotThrow(() =>
    validateClip({ start: 20, duration: 10 }, { duration: 30 }),
  );
});
