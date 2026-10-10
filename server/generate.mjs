import { renderSchema } from "./validation.mjs";

// Keep the full workflow in the worker so closing or reloading the page never
// interrupts the steps between importing, finding lyrics, and rendering.
export async function generateVideo(
  id,
  options,
  report,
  signal,
  dependencies = {},
) {
  const loadTrack = dependencies.getTrack ||
    ((...args) => import("./storage.mjs").then((module) => module.getTrack(...args)));
  const importTrack = dependencies.importTrack ||
    ((...args) => import("./media.mjs").then((module) => module.importTrack(...args)));
  const createDemo = dependencies.createDemo ||
    ((...args) => import("./media.mjs").then((module) => module.createDemo(...args)));
  const transcribeTrack = dependencies.transcribeTrack ||
    ((...args) => import("./transcribe.mjs").then((module) => module.transcribeTrack(...args)));
  const renderVideo = dependencies.renderVideo ||
    ((...args) => import("./render.mjs").then((module) => module.renderVideo(...args)));
  let progress = 0;
  const stageReport = (stage, start, end) => (value, message) => {
    signal.throwIfAborted();
    progress = Math.max(progress, Math.round(start + Math.max(0, Math.min(100, value)) * (end - start) / 100));
    report(progress, message, stage);
  };
  signal.throwIfAborted();
  const importing = stageReport("import", 0, 20);
  importing(0, options.trackId ? "Loading the full song…" : "Importing the full song…");
  const track = options.trackId
    ? await loadTrack(options.trackId)
    : options.demo
      ? await createDemo(id, importing, signal)
      : await importTrack(id, options.url, importing, signal);
  signal.throwIfAborted();

  const clip = { trackId: track.id, start: 0, duration: track.duration };
  // Validate before loading the speech model, including supplied caption edits.
  renderSchema.parse({ ...options, ...clip, captions: options.captions || [] });
  let captions = options.captions;
  let transcriptionNote = "Using your edited lyrics.";
  if (captions === undefined) {
    const transcribing = stageReport("transcribe", 20, 55);
    transcribing(0, "Finding lyrics for the entire song…");
    const transcription = await transcribeTrack(
      { ...clip, language: options.language || "auto" },
      transcribing,
      signal,
    );
    signal.throwIfAborted();
    if (!Array.isArray(transcription.cues))
      throw new Error("Lyric transcription did not return a valid result. Please try again.");
    captions = transcription.cues;
    transcriptionNote = transcription.note || (captions.length
      ? "Automatic lyrics are included. You can edit any words that were misheard."
      : "No timed vocals were detected; the full song is included without captions.");
  }
  const rendering = stageReport("render", 55, 99);
  rendering(0, "Rendering the full song with its lyrics…");
  const renderOptions = renderSchema.parse({ ...options, ...clip, captions });
  const result = await renderVideo(id, renderOptions, rendering, signal);
  signal.throwIfAborted();
  report(100, "Your full-length video is ready.", "complete");
  return {
    ...result,
    fullLength: true,
    sourceDuration: track.duration,
    track,
    captions,
    transcriptionNote,
  };
}
