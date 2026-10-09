import test from "node:test";
import assert from "node:assert/strict";
import request from "supertest";
import { createApp } from "../server/app.mjs";

function fakeJobs() {
  return {
    jobs: new Map(),
    init: async () => {},
    list: () => [],
    add: async (type, input) => ({ type, input, status: "queued" }),
    cancel: async () => undefined,
  };
}
const { app } = await createApp({ jobs: fakeJobs() });

test("health reports individual media tools", async () => {
  const response = await request(app).get("/api/health").expect(200);
  assert.equal(response.body.ok, true);
  assert.equal(typeof response.body.tools.ffmpeg, "boolean");
});
test("rejects invalid sources before creating a background job", async () => {
  await request(app)
    .post("/api/imports")
    .send({ url: "https://example.com/track" })
    .expect(400);
  const response = await request(app)
    .post("/api/imports")
    .send({ url: "https://soundcloud.com/artist/song" })
    .expect(202);
  assert.equal(response.body.status, "queued");
});
test("blocks cross-origin mutations and DNS rebinding hostnames", async () => {
  await request(app)
    .post("/api/demo")
    .set("Origin", "https://evil.test")
    .send({})
    .expect(403);
  await request(app).get("/api/health").set("Host", "evil.test").expect(403);
});
test("returns structured errors for malformed JSON, missing files and invalid IDs", async () => {
  await request(app)
    .post("/api/imports")
    .set("Content-Type", "application/json")
    .send("{")
    .expect(400);
  await request(app).get("/api/tracks/not-a-uuid").expect(400);
  await request(app)
    .get("/api/tracks/310b3a1c-9693-4a5e-9eec-c3da41060270")
    .expect(404);
  await request(app).get("/api/nope").expect(404);
});
test("cannot download incomplete or nonexistent exports", async () => {
  await request(app)
    .get("/api/renders/310b3a1c-9693-4a5e-9eec-c3da41060270/download")
    .expect(404);
});
