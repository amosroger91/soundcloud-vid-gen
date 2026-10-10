# SoundCloud Video Generator

**Finds Studio** turns a SoundCloud song into a polished portrait video with its artwork, audio visualizations, lyric captions, and animated branding.

## Overview

Paste a public SoundCloud song link and click the arrow beside it. One background job imports the **entire song**, generates timed lyrics automatically, and renders a **1080 × 1920, 30 fps MP4**. No separate lyric or render clicks are needed. Songs up to 10 minutes are supported, with their exact source duration preserved. The video includes cover art, title, artist, an audio-driven spectrum, and word-by-word lyric highlights.

Videos move between three artwork treatments: a layered record sleeve, an audio-reactive orbit, and a widescreen crop. **Dynamic** uses 3–6 second scenes and favors detected musical attacks for transitions; **Drift** uses 6–9 second scenes with gentler movement. Short clips can contain one scene. Bass, treble, and actual audio attacks drive the accents, with no invented beats during silence. Backgrounds pick up the cover art, while titles and lyrics keep their own readable space.

Track metadata, song duration, volume number, and the visual mix determine the camera moves and scene order. **Remix visuals** creates a new arrangement; repeated previews and exports of the same settings stay consistent. Scene selection avoids adjacent repeats and fixed two- or three-scene loops.

An original SoundCloud Finds logo arrives after 2.5 seconds of music, reappears after the song ends, and gives way to a six-second black “Please subscribe” card. The card names the song and artist and asks viewers to look up the song on SoundCloud and follow the artist there. The editor shows one **Download full video** button only after the full-length MP4 finishes. Live previews and old short-clip exports have no download button. Descriptions can be copied; artwork and SRT sidecars remain available through the API. The app runs locally and requires no paid API key. Optionally, connect a TikTok account to send finished videos straight to your TikTok drafts.

## Architecture

```text
React editor + shared Canvas preview
                   │ HTTP
              Express API
                   │ persisted serial job queue
              Node worker process
                   ├── yt-dlp → SoundCloud MP3 + metadata + cover
                   ├── FFmpeg PCM → FFT.js → real audio visualization
                   ├── local Whisper / ONNX → timed words → editable captions
                   └── Canvas frames + FFmpeg → MP4, description, SRT, artwork
```

Preview and export share the composition, caption, logo, and timeline code. FFmpeg creates H.264/AAC MP4 files with fast-start playback. Tracks, analysis, job state, and exports persist under `data/`. Completed jobs survive restarts; interrupted jobs become retryable failures. One job runs at a time, with eight active/queued jobs allowed in total.

The application uses React, Express, and Node. Postgres and n8n are unnecessary for the local media pipeline. Authenticated business integrations, if added later, go through n8n.

## Quick start

Requires **Node 22.12+**; Node 22 or 24 LTS is recommended. Windows x64, macOS, and Linux x64/ARM64 work where the npm native dependencies provide binaries.

```bash
git clone https://github.com/amosroger91/soundcloud-vid-gen.git
cd soundcloud-vid-gen
npm install
npm run setup
npm run dev
```

Open **http://127.0.0.1:4317**. Click **Try a demo** for original instrumental audio and artwork, or paste your own SoundCloud song link.

Setup downloads the official standalone yt-dlp executable, verifies its release SHA-256 checksum, and prepares the FFmpeg/ffprobe binaries supplied by npm dependencies. Separate Python or FFmpeg installations are not required. Fonts and licenses are included; setup restores missing font files.

The first full-song job with vocals downloads and caches a local Whisper model automatically. To download it ahead of time:

```bash
npm run setup:speech
```

The default model uses approximately 140 MB of weights. Transcription runs on your CPU and audio stays on your computer. Later jobs reuse the cache. The first download needs internet access; transcription can subsequently work offline with a complete cache.

For the production build:

```bash
npm run build
npm start
```

## Configuration

Optionally copy `.env.example` to `.env`. Every setting has a default; no API token is needed.

| Variable          | Required | Default / purpose                                                                                                                            |
| ----------------- | -------- | -------------------------------------------------------------------------------------------------------------------------------------------- |
| `HOST`            | No       | `127.0.0.1`; local bind address. This application has no authentication and is intended for local use.                                       |
| `PORT`            | No       | `4317`; HTTP port.                                                                                                                           |
| `DATA_DIR`        | No       | `<project>/data`; absolute path recommended for generated media and job state.                                                               |
| `YTDLP_PATH`      | No       | `<project>/.runtime/yt-dlp[.exe]`; override the downloader executable. Setup skips its download when set.                                    |
| `YTDLP_VERSION`   | No       | Latest stable official release at setup time; optionally pin a release tag.                                                                  |
| `FFMPEG_PATH`     | No       | `ffmpeg-static` binary; custom encoder executable. Rerun setup after changing.                                                               |
| `FFPROBE_PATH`    | No       | `ffprobe-static` binary; custom probe executable. Rerun setup after changing.                                                                |
| `WHISPER_MODEL`   | No       | `onnx-community/whisper-base_timestamped`; a compatible multilingual model with word-timestamp outputs and fp32 encoder / q8 merged decoder. |
| `MODEL_CACHE_DIR` | No       | `~/.cache/soundcloud-vid-gen/models`; use a **local disk**, especially on Windows. ONNX model loading can fail on mapped network drives.     |
| `TIKTOK_CLIENT_KEY` / `TIKTOK_CLIENT_SECRET` | No | Your TikTok developer app credentials; enables **Send to TikTok drafts**. See below. |
| `APP_URL`         | No       | `http://127.0.0.1:4317`; browser/workflow verification target only.                                                                          |

Stop imports and renders before updating the runtime. The installed yt-dlp version is recorded in `.runtime/version.txt`. Rerun `npm run setup` when SoundCloud changes require a newer importer.

## TikTok drafts

1. At developers.tiktok.com, create an app with **Login Kit** (Desktop platform) and the **Content Posting API**, and request the `user.info.basic` and `video.upload` scopes.
2. Register the redirect URI `http://127.0.0.1:4317/api/tiktok/callback/`. Change the port if you changed `PORT`, or set `TIKTOK_REDIRECT_URI`.
3. Put the client key and secret in `.env` and restart the app.
4. After a render, click **Connect TikTok** once, then **Send to TikTok drafts**. The MP4 is uploaded in chunks to your TikTok inbox, and the description is copied to your clipboard. Open the TikTok notification, paste the caption, and post.

Tokens are stored in `data/tiktok/token.json` and refreshed automatically. **Disconnect** revokes them. Lyric subtitles are burned into the video; TikTok's API does not accept `.srt` files. TikTok limits how many drafts can be pending per 24 hours.

## Usage / HTTP API

1. **Generate:** paste one public SoundCloud song URL and click the arrow beside the input. The app imports the whole song, finds lyrics, and renders it in one persisted job. You can reload the page while it works. Supported tracks are 3 seconds to 10 minutes, up to 100 MB.
2. **Download:** when the job completes, use the single **Download full video** button. With branding enabled, the final duration is the full song plus 9.2 seconds for the logo outro and a six-second card asking viewers to subscribe, find the song on SoundCloud, and follow the artist there. The intro overlays the music and never shifts the lyrics.
3. **Optional edits:** expand **Optional style & lyric edits** to change the palette, motion, visual mix, branding, or lyric text. Apply lyric edits, then use **Update full video** to save a revised full-song export. Live previews never have download actions. Lyric times are seconds from the start of the song.
4. **Post:** copy the generated description or send the completed video to TikTok drafts. Full-length exports are available in the history. Instrumental demo tracks finish without invented lyrics. A transcription failure stops the job and reports an error instead of silently exporting without lyrics.

| Method | Endpoint                       | Purpose                                                                                                                           |
| ------ | ------------------------------ | --------------------------------------------------------------------------------------------------------------------------------- |
| GET    | `/api/health`                  | Media-tool availability.                                                                                                          |
| POST   | `/api/videos`                  | Full workflow with `{ "url": "https://soundcloud.com/artist/song" }`; automatically imports, transcribes, and renders the entire song. |
| POST   | `/api/imports`                 | Start import with `{ "url": "https://soundcloud.com/artist/song" }`.                                                              |
| POST   | `/api/demo`                    | Create the original instrumental demo.                                                                                            |
| GET    | `/api/jobs`                    | Most recent 30 jobs.                                                                                                              |
| GET    | `/api/jobs/:id`                | Status, progress, result, or error.                                                                                               |
| POST   | `/api/jobs/:id/cancel`         | Cancel an active or queued job.                                                                                                   |
| GET    | `/api/tracks/:id`              | Track metadata and asset URLs.                                                                                                    |
| GET    | `/api/tracks/:id/audio`        | MP3 with range-request support.                                                                                                   |
| GET    | `/api/tracks/:id/artwork`      | Cover JPEG, when available.                                                                                                       |
| GET    | `/api/tracks/:id/analysis`     | Spectrum frames and waveform envelope.                                                                                            |
| POST   | `/api/transcriptions`          | Transcribe `{ "trackId": "uuid", "start": 0, "duration": 30, "language": "auto" }`; result includes timed words and grouped cues. |
| POST   | `/api/renders`                 | Render `{ "trackId": "uuid", "start": 0, "duration": 30, "theme": "ember", "episode": "001", "branded": true, "captions": [] }`.  |
| GET    | `/api/renders/:id/video`       | Completed MP4 playback.                                                                                                            |
| GET    | `/api/renders/:id/download`    | MP4 download.                                                                                                                     |
| GET    | `/api/renders/:id/poster`      | Poster JPEG.                                                                                                                      |
| GET    | `/api/renders/:id/description` | Generated `description.txt`.                                                                                                      |
| GET    | `/api/renders/:id/captions`    | `lyrics.srt`; empty when there are no captions.                                                                                   |
| GET    | `/api/tiktok/status`           | Whether TikTok is configured and connected.                                                                                       |
| GET    | `/api/tiktok/connect`          | Starts TikTok sign-in (PKCE).                                                                                                     |
| POST   | `/api/tiktok/drafts`           | Upload `{ "renderId": "uuid" }` to the TikTok inbox as a draft job.                                                              |
| POST   | `/api/tiktok/disconnect`       | Revoke and delete the stored TikTok token.                                                                                        |
| GET    | `/api/renders/:id/artwork`     | Downloadable `cover-art.jpg`, when available.                                                                                     |

Creation endpoints return `202` and a job ID. Poll until `status` is `complete`, `failed`, or `cancelled`. Caption cues contain `{ start, end, text, words? }`; optional words use the same fields. Times must be ordered and within the clip. Invalid input returns `400`, missing assets `404`, and a full queue `429`.

Full-song `/api/videos` requests accept exactly one source: `url`, `trackId`, or `demo: true`. They accept visual settings and `language`, but reject `start` and `duration`. Omit `captions` for automatic transcription; supply edited captions (including an explicit empty array) to reuse manual edits. Generated results include `fullLength`, `sourceDuration`, track metadata, and captions. The lower-level import/transcription/render endpoints remain available for scripts.

Render requests also accept `motion: "dynamic" | "drift"` (default `"dynamic"`) and `variation: 0..9999` (integer, default `0`). Save both with the other render settings to reproduce a mix.

## Project structure

```text
client/          React editor, audio preview, caption editor, description panel
server/          API, job queue, SoundCloud import, transcription, and encoding
shared/          Canvas composition, original logo, captions, and video timeline
assets/brand/    Original logo as reusable SVG and transparent PNG
assets/fonts/    Bundled fonts with OFL notices
scripts/         Setup, logo generation, render/browser/transcription checks
test/            Analysis, captions, timeline, queue, validation, and HTTP tests
todos/           Complete implementation checklist
docs/progress/   Daily progress record
.github/         GitHub Actions verification
data/            Imported/generated media and jobs (ignored)
.runtime/        Media executables (ignored)
test-results/    Local verification screenshots, fixtures, and reports (ignored)
```

## Tech stack

- Node.js / npm, Express 5, React 19, Vite, Lucide, Zod.
- [yt-dlp](https://github.com/yt-dlp/yt-dlp) for SoundCloud extraction.
- [FFmpeg](https://ffmpeg.org/ffmpeg.html) / ffprobe via npm for decoding, encoding, and output verification.
- [`@napi-rs/canvas`](https://github.com/Brooooooklyn/canvas) for native Canvas frames.
- [`fft.js`](https://github.com/indutny/fft.js) for Hann-windowed FFT analysis.
- [Transformers.js](https://huggingface.co/docs/transformers.js/guides/node-audio-processing), ONNX Runtime, and [Whisper with word timestamps](https://huggingface.co/onnx-community/whisper-base_timestamped) for local transcription.
- Node's test runner, Supertest, and Playwright.

## Verification

```bash
npm test              # analysis, validation, captions, timing, jobs, HTTP behavior
npm run build         # production frontend bundle
npm run test:render   # real portrait MP4 + codecs, duration, sync, silent-tail checks
npm run test:visuals  # six-frame visual contact sheet + 18-second motion showcase
npm run test:browser  # one-click workflow; run with the app serving locally
npm run test:full-song # 72.5s export with lyrics/audio past 60s; same server + DATA_DIR
```

The render check uses original demo audio and explicitly supplied test captions; these are a caption-animation fixture, not lyrics claimed to come from the instrumental demo. It checks output geometry, codecs, frame rate, duration, selected audio offset, and silent outro, and saves representative decoded frames.

The browser check submits the URL button once, substitutes original demo audio for the external source, and checks automatic generation, reload during work, the full 45-second source plus branding, a single full-length download, mobile layout, optional edits, and finished-result recovery. The full-song check separately encodes a 72.5-second source and verifies matching audio and visible captions after 60 seconds. Windows uses installed Chrome. Elsewhere run `npx playwright install chromium` first. GitHub Actions runs tests, build, and the render check without requiring a SoundCloud account or speech-model download.

For additional transcription testing, supply a local vocal WAV to `node scripts/check-transcription.mjs <file.wav>`. `node scripts/check-vocal-workflow.mjs <file.wav>` mixes a fixture over original demo music, exercises transcription/export through the running HTTP server, and verifies cancellation preserves source media. Its default fixture expects the original test phrase containing “city lights”; adapt that assertion for a different fixture.

Lyric timing is checked in two separate ways. `npm test` renders frames and requires the highlighted word to change on its timestamp, within one frame at 30 fps, inside the reserved lyric slot rather than over the artwork. Extraction quality is scored against words you timed by ear:

```bash
node scripts/check-lyric-sync.mjs song.wav reference.json [start] [duration]
```

`reference.json` is `{ "words": [ { "text": "city", "start": 0.42, "end": 0.81 } ] }`, with times in seconds into the clip. The report gives word error rate and onset error. A positive onset bias means the lyric is late. It fails when the median onset error is over 250 ms or the word error rate is over 35%.

## Notes / conventions

- **Review generated lyrics.** Whisper is speech recognition, not a guaranteed lyric database. Singing, reverb, instruments, and language can reduce accuracy or produce hallucinations. Silent regions are filtered, and the known instrumental demo skips transcription. Clear mistaken lines, edit timing, or use instrumental mode. Word timings can also need correction; manually edited phrases get evenly spaced highlights within their cue.
- Use audio and artwork you are allowed to download and reuse. Availability and attribution do not grant redistribution rights. Private, removed, region-restricted, or subscription-only tracks may fail. The importer does not use account cookies, proxies, or DRM bypasses. MP3 conversion does not improve source quality.
- The spectrum and waveform come from actual audio. “Level” is windowed RMS in dBFS. It is not a BPM or loudness-normalization measurement. Analysis runs at 16 kHz; the spectrum covers approximately 40 Hz–7.2 kHz.
- Rendering and transcription run in a separate process; speed depends on CPU and storage. Encoding/inference use four CPU threads. A local `DATA_DIR` may improve performance when source code lives on a network drive.
- Media remains local until you remove it. Stop the app before cleaning `data/`. Keep wanted exports first; removing the entire `data/` folder resets the library. The separately located speech-model cache can also be removed to reclaim space.
- No secrets in the repo. `.env`, media, binaries, dependencies, and certificates are ignored. Do not expose the unauthenticated server directly to the internet; shared hosting would require authentication, quotas, and storage lifecycle management.
- Native export uses static Montserrat faces because browser Canvas and Skia handle variable-font weights differently. Font license notices are in `assets/fonts/`.

Independent tool; not affiliated with SoundCloud or TikTok.
