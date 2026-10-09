# SoundCloud Finds — Complete Project To-Do List

**Updated:** October 9, 2026
**Project folder:** `Z:\profiles\roger\Documents\dev\soundcloud-vid-gen`
**Working branch:** `codex/soundcloud-finds`
**Requested repository:** https://github.com/amosroger91/soundcloud-vid-gen.git
**Goal:** Turn a SoundCloud song URL into a visually polished vertical video with the song, artist, album artwork, audio visualizations, synchronized lyric subtitles, custom branding, matching intro/outro animations, a thank-you ending, and an automatically generated video description.

Checked items reflect implemented work or completed verification. All application features are implemented and locally verified; final GitHub delivery is tracked below.

## 1. Create the Node/npm project

- [x] Create the project under the development folder.
- [x] Use Node.js and npm, with packages for the web editor, audio analysis, artwork rendering, and video encoding.
- [x] Initialize Git and configure the user-provided GitHub repository as `origin`.
- [x] Add scripts for local development, production build, tests, and media-tool setup.
- [x] Ignore dependencies, downloaded media, generated videos, runtime binaries, and secrets in Git.
- [x] Complete the README with accurate installation, configuration, usage, and troubleshooting instructions for the finished feature set.

## 2. Import a SoundCloud song and its artwork

- [x] Accept a SoundCloud song URL in the editor.
- [x] Validate supported song links and handle SoundCloud share-link redirects.
- [x] Download the song and make a local MP3 available to the renderer.
- [x] Retrieve the album/cover artwork.
- [x] Retrieve the song title and artist for attribution.
- [x] Provide a generated cover when artwork is unavailable and explain the fallback in the editor.
- [x] Implement useful error messages for invalid or unavailable songs.
- [x] Verify a real SoundCloud import, including audio, artist metadata, and cover art.

## 3. Generate the portrait music video

- [x] Export a skinny, tall TikTok-style video: 9:16 at 1080 × 1920.
- [x] Encode an MP4 with H.264 video and AAC audio at 30 fps.
- [x] Play the selected song segment over the video.
- [x] Show the album artwork prominently.
- [x] Show the song title and artist in the video.
- [x] Include “SoundCloud Finds” branding in the base composition.
- [x] Generate a waveform from the actual audio and animate playback progress across it.
- [x] Add a frequency-spectrum visualization driven by the actual audio.
- [x] Include audio measurements alongside the visualizations.
- [x] Provide clip start/length controls, visual palettes, and volume numbering.
- [x] Provide a browser preview with audio playback.
- [x] Implement background generation, progress display, cancellation, and MP4 download.
- [x] Save completed exports locally and display recent exports.
- [x] Add original demo audio and artwork for testing without a SoundCloud URL.
- [x] Polish the final composition to accommodate lyric subtitles and the new logo animations while keeping the artist and artwork visible.

## 4. Extract lyrics and show synchronized subtitles

- [x] Transcribe the sung/spoken lyrics from the imported audio. This needs speech-to-text; the request referred to it as “TTS.”
- [x] Select and integrate an appropriate transcription engine, with its setup requirements documented.
- [x] Obtain timestamps for the transcribed words or phrases.
- [x] Keep subtitle timing aligned with the selected clip start and duration.
- [x] Render the lyrics as subtitles over the video while they are being sung.
- [x] Design visually appealing caption typography, line breaks, highlighting, and entrance/exit motion.
- [x] Keep subtitles readable over the artwork and visualizer, with placement appropriate for a vertical video.
- [x] Filter silent/untimed output and provide instrumental mode plus editable lyric review; document that speech models can mishear or hallucinate over music.
- [x] Include the subtitle treatment in the preview as well as the exported video.
- [x] Verify word timing and subtitle export using original vocal audio mixed over music.

## 5. Create the custom logo and matching intro/outro

- [x] Design an original logo for the series, using “SoundCloud Finds” or a closely related name.
- [x] Save the logo as a reusable project asset suitable for sharp video rendering.
- [x] Create an aesthetically polished logo appearance animation.
- [x] Make the logo disappear with a matching animation.
- [x] Reuse the same visual language and appearance/disappearance motion for both intro and outro.
- [x] Let the song play for a few seconds before the intro logo appears.
- [x] Continue the music underneath the intro logo animation.
- [x] Show the matching outro logo after the song/selected song segment ends.
- [x] Keep the intro/outro transitions smooth and consistent with the main video design.
- [x] Account for the added outro duration without shifting the song’s subtitle timing.

## 6. Add the final thank-you screen

- [x] Add a few seconds of black at the end of the video.
- [x] Display “Thanks for watching” on that black end screen.
- [x] Use polished typography and a clean transition from the logo outro.
- [x] Verify the final frame and ending duration in the actual exported MP4.

## 7. Automatically generate the video description

- [x] Generate description text automatically for each exported video.
- [x] Include the song title and artist.
- [x] Include the source SoundCloud song link.
- [x] Include an album-art reference/link and artwork credit where the source provides one; a plain-text description cannot embed the image itself.
- [x] Keep the actual album artwork and artist attribution in the video as requested.
- [x] Match the description’s tone to the “SoundCloud Finds” series.
- [x] Make the generated description available to copy or download alongside the video.
- [x] Keep each description associated with the correct track and export.

## 8. Finish visual and functional verification

- [x] Pass the initial 13 automated tests covering audio analysis, validation, and HTTP behavior.
- [x] Produce the initial production frontend build successfully.
- [x] Render a real three-second 1080 × 1920 test video.
- [x] Verify the test export’s codecs, frame rate, duration, and selected audio offset.
- [x] Inspect desktop and mobile editor screenshots for the base workflow.
- [x] Identify and implement a fix for the export renderer’s font-weight mismatch.
- [x] Complete browser verification of the full import → edit → preview → export → download workflow after the latest fixes.
- [x] Visually inspect the corrected exported typography.
- [x] Verify cancellation, failures, and persisted exports.
- [x] Test the complete video with lyrics, delayed intro logo, artwork, artist attribution, matching outro, and black thank-you ending.
- [x] Confirm audio, lyric subtitles, waveform, and visualizer stay synchronized throughout the selected clip.
- [x] Confirm the finished video remains 9:16 and the generated description contains the correct artist and artwork reference.
- [x] Update automated checks for the added features and rerun relevant tests and the production build.
- [x] Record the final validation results and daily progress.

## 9. Push the finished project to GitHub

- [ ] Review the final source changes and confirm generated media and secrets are excluded.
- [ ] Commit the completed implementation and documentation.
- [ ] Put the finished project on `main` as requested.
- [ ] Push to `https://github.com/amosroger91/soundcloud-vid-gen.git` after the requested features are complete.
- [ ] Confirm the push succeeded and the remote contains the finished project.
- [ ] Report the repository link, local project path, startup command, and any remaining limitations.

## 10. Provide this Markdown checklist

- [x] Consolidate all project requests into one Markdown to-do list.
- [x] Distinguish completed work from outstanding work.
- [x] Save the list at `Z:\profiles\roger\Documents\dev\soundcloud-vid-gen\todos\portrait-video.md`.
- [x] Provide the full file path in the response.

## Verification evidence

- 27 automated tests passing, 0 failing.
- Production frontend build passed.
- Live SoundCloud import verified: audio, artist metadata, and artwork.
- Full 14.2-second 1080 x 1920 MP4 verified: 8 seconds of music plus 6.2 seconds of branded ending, H.264/AAC at 30 fps.
- Exported audio correlation with the selected source segment: 0.99998; outro audio verified silent.
- Local speech model recognized 17 timed words from original vocals over music; API transcription, rendering, description, and cancellation checks passed.
- Desktop/mobile browser workflow passed with no page errors.
- Dependency audit: 0 known vulnerabilities.
- Detailed local reports and decoded frame images: `test-results/` (ignored by Git).
- Limitation: automatic lyric accuracy varies with singing, mixing, and language. Review the editable transcript before posting.
