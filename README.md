# SoundCloud Finds

Turn a SoundCloud song into an audio-reactive vertical video.

## Overview

This local Node application imports a public SoundCloud track and its cover art, lets you select a clip, and renders a 1080 × 1920 MP4. The composition includes SoundCloud Finds branding, real frequency analysis, a waveform, and track attribution.

## Architecture

React editor → Express API → yt-dlp import → FFT analysis + Canvas frames → FFmpeg MP4.

Files and job records are stored locally; no database or external account is required. This project uses React, Express, and Node. Postgres and n8n are unnecessary for this local media pipeline.

## Quick start

Requires Node 22.12+ and npm. Run `npm install`, `npm run setup`, `npm run dev`, then open http://127.0.0.1:4317. Production: `npm run build` then `npm start`.

## Configuration

Copy `.env.example` to `.env` to override defaults. Configuration and API documentation will be completed alongside implementation.

## Usage / HTTP API

Paste a SoundCloud song link, select a clip, preview, and export a portrait MP4. A generated demo track is included for offline testing.

## Project structure

- `client/`: React editor.
- `server/`: imports, analysis, jobs, and rendering.
- `shared/`: Canvas composition shared by preview and export.
- `scripts/`: runtime setup and render verification.
- `test/`: automated tests.
- `data/`: ignored media and job state.
- `todos/`: development checklist.

## Tech stack

- Node.js, npm, Express, React, Vite.
- yt-dlp, FFmpeg, Canvas, FFT.

## Notes / conventions

No secrets in the repo. Only import audio you are allowed to download and reuse. Private, unavailable, subscription-only, or region-restricted songs may fail; access restrictions are not bypassed. Authenticated business integrations, if added later, go through n8n.
