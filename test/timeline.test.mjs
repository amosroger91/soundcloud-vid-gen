import test from "node:test";
import assert from "node:assert/strict";
import { timeline, totalDuration, logoEnvelope } from "../shared/timeline.mjs";
import { videoDescription } from "../server/description.mjs";

test("music leads for 2.5 seconds before the intro logo appears", () => {
  assert.equal(timeline(2, 30).logo, 0);
  assert.ok(timeline(3.7, 30).logo > 0.9);
  assert.equal(timeline(6, 30).logo, 0);
});
test("matching logo envelope appears after the clip ends and then a black thank-you card", () => {
  assert.equal(timeline(29.9, 30).stage, "music");
  assert.equal(timeline(31.5, 30).stage, "outro");
  assert.equal(timeline(34, 30).stage, "thanks");
  assert.equal(totalDuration(30), 36.2);
  assert.ok(Math.abs(logoEnvelope(0.4) - logoEnvelope(2.8)) < 0.001);
});
test("intro does not add time to the song or subtitles", () => {
  assert.equal(timeline(4, 30).musicTime, 4);
  assert.equal(timeline(33, 30).musicTime, 30);
  assert.equal(totalDuration(30, false), 30);
});
test("description credits the specific artist and artwork without inventing an album", () => {
  const description = videoDescription(
    {
      title: "Test song",
      artist: "Test artist",
      sourceUrl: "https://soundcloud.com/artist/song",
      hasArtwork: true,
      artworkSourceUrl: "https://i1.sndcdn.com/example.jpg",
    },
    { episode: "2", start: 10, duration: 30 },
  );
  assert.match(description, /Test artist/);
  assert.match(description, /https:\/\/i1.sndcdn.com\/example.jpg/);
  assert.match(description, /Vol. 002/);
  assert.doesNotMatch(description, /Album:/);
});
