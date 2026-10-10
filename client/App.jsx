import { useEffect, useRef, useState } from "react";
import {
  ArrowDownToLine,
  ArrowRight,
  AudioLines,
  Check,
  ChevronRight,
  Disc3,
  Headphones,
  Link,
  LoaderCircle,
  Pause,
  Play,
  Radio,
  RotateCcw,
  SlidersHorizontal,
  X,
} from "lucide-react";
import {
  THEMES,
  drawFrame,
  clipWaveform,
  clock,
} from "../shared/composition.mjs";
import { totalDuration, timeline } from "../shared/timeline.mjs";
import { cuesToEditor, parseEditor } from "../shared/captions.mjs";

async function api(url, body, signal) {
  const response = await fetch(url, {
    method: body === undefined ? "GET" : "POST",
    headers: body === undefined ? {} : { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  const json = await response.json();
  if (!response.ok) throw new Error(json.error || "Request failed.");
  return json;
}
const active = (job) => job && ["queued", "running"].includes(job.status);

function Preview({
  track,
  analysis,
  options,
  audioRef,
  playbackRef,
  onTick,
  onPlaying,
}) {
  const canvasRef = useRef(null);
  const [art, setArt] = useState(null);
  useEffect(() => {
    setArt(null);
    if (!track?.artworkUrl) return;
    let cancelled = false;
    const image = new Image();
    image.onload = () => {
      if (!cancelled) setArt(image);
    };
    image.src = track.artworkUrl;
    return () => {
      cancelled = true;
    };
  }, [track]);
  useEffect(() => {
    let raf,
      stopped = false,
      lastTick = 0;
    const ctx = canvasRef.current.getContext("2d");
    const wave = clipWaveform(analysis, options.start, options.duration);
    const draw = () => {
      if (stopped) return;
      const state = playbackRef.current,
        audio = audioRef.current,
        now = performance.now();
      if (state.playing && audio) {
        if (state.time < options.duration) {
          state.time = Math.max(0, audio.currentTime - options.start);
          if (state.time >= options.duration || audio.ended) {
            audio.pause();
            state.time = options.duration;
            state.anchorTime = now;
            state.anchorValue = options.duration;
          }
        } else state.time = state.anchorValue + (now - state.anchorTime) / 1000;
        if (state.time >= totalDuration(options.duration, options.branded)) {
          state.time = totalDuration(options.duration, options.branded);
          state.playing = false;
          audio.pause();
          onPlaying(false);
        }
      }
      drawFrame(ctx, {
        width: 540,
        height: 960,
        track,
        art,
        analysis,
        wave,
        ...options,
        time: state.time,
      });
      if (now - lastTick > 100) {
        onTick(state.time);
        lastTick = now;
      }
      raf = requestAnimationFrame(draw);
    };
    document.fonts.ready.then(() => {
      if (!stopped && canvasRef.current) draw();
    });
    return () => {
      stopped = true;
      cancelAnimationFrame(raf);
    };
  }, [
    track,
    analysis,
    art,
    options.start,
    options.duration,
    options.theme,
    options.episode,
    options.branded,
    options.captions,
    audioRef,
    playbackRef,
    onTick,
    onPlaying,
  ]);
  return (
    <canvas
      ref={canvasRef}
      width="540"
      height="960"
      aria-label="Portrait video preview with artwork, frequency spectrum, and waveform"
    />
  );
}

export default function App() {
  const [url, setUrl] = useState("");
  const [track, setTrack] = useState(null);
  const [analysis, setAnalysis] = useState(null);
  const [job, setJob] = useState(null);
  const [exports, setExports] = useState([]);
  const [error, setError] = useState("");
  const [health, setHealth] = useState(null);
  const [loading, setLoading] = useState(false);
  const [playing, setPlaying] = useState(false);
  const [playTime, setPlayTime] = useState(0);
  const [result, setResult] = useState(null);
  const [options, setOptions] = useState({
    start: 0,
    duration: 30,
    theme: "ember",
    episode: "001",
    branded: true,
    captions: [],
  });
  const [transcript, setTranscript] = useState(null);
  const [captionText, setCaptionText] = useState("");
  const [language, setLanguage] = useState("auto");
  const [captionMessage, setCaptionMessage] = useState("");
  const [copied, setCopied] = useState(false);
  const [tiktok, setTiktok] = useState(null);
  const [tiktokMessage, setTiktokMessage] = useState("");
  const audioRef = useRef(null);
  const playbackRef = useRef({
    time: 0,
    playing: false,
    anchorTime: 0,
    anchorValue: 0,
  });
  const busy = loading || active(job);
  const captionDirty = captionText !== cuesToEditor(options.captions);

  async function loadTrack(next) {
    const data = await api(next.analysisUrl);
    audioRef.current?.pause();
    setPlaying(false);
    playbackRef.current.time = 0;
    playbackRef.current.playing = false;
    setTranscript(null);
    setCaptionText("");
    setCaptionMessage("");
    setTrack(next);
    setAnalysis(data);
    setResult(null);
    setPlayTime(0);
    setOptions((current) => ({
      ...current,
      captions: [],
      start: 0,
      duration: Math.min(30, Math.floor(next.duration * 100) / 100),
    }));
    localStorage.setItem("finds-track", next.id);
  }
  useEffect(() => {
    api("/api/health")
      .then(setHealth)
      .catch((error) => setError(error.message));
    api("/api/tiktok/status")
      .then(setTiktok)
      .catch(() => {});
    const connected = new URLSearchParams(location.search).get("tiktok");
    if (connected) {
      if (connected === "connected")
        setTiktokMessage("TikTok connected. Render a video, then send it to your drafts.");
      else setError(connected);
      history.replaceState(null, "", location.pathname);
    }
    api("/api/jobs")
      .then((jobs) => {
        setExports(
          jobs.filter(
            (job) => job.type === "render" && job.status === "complete",
          ),
        );
        const running = jobs.find(active);
        if (running) setJob(running);
      })
      .catch((error) => setError(error.message));
    const saved = localStorage.getItem("finds-track");
    if (saved)
      api(`/api/tracks/${saved}`)
        .then(loadTrack)
        .catch(() => localStorage.removeItem("finds-track"));
  }, []);
  useEffect(() => {
    if (!active(job)) return;
    let cancelled = false;
    let timer;
    const controller = new AbortController();
    async function poll() {
      try {
        const next = await api(
          `/api/jobs/${job.id}`,
          undefined,
          controller.signal,
        );
        if (cancelled) return;
        setJob(next);
        if (next.status === "complete") {
          if (next.type === "render") {
            setResult(next.result);
            setExports((current) =>
              [next, ...current.filter((item) => item.id !== next.id)].slice(
                0,
                6,
              ),
            );
          } else if (next.type === "transcribe") {
            setTranscript(next.result);
            setCaptionText(cuesToEditor(next.result.cues));
            setCaptionMessage(next.result.note);
            setOptions((current) => ({
              ...current,
              captions: next.result.cues,
            }));
          } else if (next.type === "tiktok") {
            setTiktokMessage(
              next.result.inbox
                ? "Sent! Open the TikTok app inbox notification to finish your post. The caption is on your clipboard."
                : "Uploaded. TikTok is still processing it; the inbox notification should arrive shortly.",
            );
          } else await loadTrack(next.result);
        } else if (next.status === "failed") setError(next.error);
        else if (active(next)) timer = setTimeout(poll, 800);
      } catch (error) {
        if (!cancelled) {
          setError(`Could not check progress: ${error.message}`);
          timer = setTimeout(poll, 3000);
        }
      }
    }
    timer = setTimeout(poll, 300);
    return () => {
      cancelled = true;
      clearTimeout(timer);
      controller.abort();
    };
  }, [job?.id, job?.status]);

  async function startJob(endpoint, body) {
    setLoading(true);
    setError("");
    setResult(null);
    audioRef.current?.pause();
    playbackRef.current.playing = false;
    setPlaying(false);
    try {
      setJob(await api(endpoint, body));
    } catch (error) {
      setError(error.message);
    } finally {
      setLoading(false);
    }
  }
  function updateClip(patch) {
    audioRef.current?.pause();
    setPlaying(false);
    playbackRef.current.playing = false;
    playbackRef.current.time = 0;
    const next = { ...options, ...patch };
    next.duration = Math.max(
      3,
      Math.min(next.duration, track?.duration || 60, 60),
    );
    next.start = Math.max(
      0,
      Math.min(next.start, (track?.duration || 60) - next.duration),
    );
    next.captions = [];
    setTranscript(null);
    setCaptionText("");
    setCaptionMessage("");
    setOptions(next);
    setPlayTime(0);
    if (audioRef.current) audioRef.current.currentTime = next.start;
  }
  async function togglePlay() {
    const audio = audioRef.current;
    if (!audio || !track) return;
    const state = playbackRef.current;
    if (state.playing) {
      audio.pause();
      state.playing = false;
      setPlaying(false);
    } else {
      if (state.time >= totalDuration(options.duration, options.branded) - 0.08)
        state.time = 0;
      state.anchorTime = performance.now();
      state.anchorValue = state.time;
      try {
        if (state.time < options.duration) {
          audio.currentTime = options.start + state.time;
          await audio.play();
        }
        state.playing = true;
        setPlaying(true);
      } catch {
        setError("The audio could not play. Try importing the track again.");
      }
    }
  }
  function seekPreview(value) {
    audioRef.current?.pause();
    setPlaying(false);
    playbackRef.current.playing = false;
    playbackRef.current.time = value;
    setPlayTime(value);
    if (audioRef.current)
      audioRef.current.currentTime =
        options.start + Math.min(value, options.duration);
  }
  function applyCaptions() {
    try {
      const captions = parseEditor(
        captionText,
        options.duration,
        transcript?.cues || [],
      );
      setOptions((current) => ({ ...current, captions }));
      setCaptionMessage(
        captions.length
          ? "Caption edits applied to the preview and next export."
          : "Captions cleared. This clip will export without lyrics.",
      );
      setError("");
    } catch (error) {
      setError(error.message);
    }
  }
  async function sendToTiktok() {
    setError("");
    setTiktokMessage("");
    await navigator.clipboard.writeText(result.description).catch(() => {});
    try {
      setJob(
        await api("/api/tiktok/drafts", {
          renderId: result.videoUrl.split("/")[3],
        }),
      );
    } catch (error) {
      setError(error.message);
    }
  }
  async function disconnectTiktok() {
    try {
      setTiktok(await api("/api/tiktok/disconnect", {}));
      setTiktokMessage("");
    } catch (error) {
      setError(error.message);
    }
  }
  async function copyDescription() {
    try {
      await navigator.clipboard.writeText(result.description);
      setCopied(true);
    } catch {
      setError(
        "Clipboard access was unavailable. Select the description text or download it instead.",
      );
    }
  }

  return (
    <div className="studio">
      <header className="topbar">
        <a className="wordmark" href="/" aria-label="SoundCloud Finds home">
          <AudioLines size={29} strokeWidth={1.7} />
          <span>
            FINDS<span className="wordmark-light"> / STUDIO</span>
          </span>
        </a>
        <div className="top-meta">
          <span className="status-dot" />
          LOCAL VIDEO STUDIO<span className="edition">EDITION 001</span>
        </div>
      </header>
      <main className="workspace">
        <section className="editor" aria-label="Video editor">
          <div className="intro">
            <div className="eyebrow">
              <Radio size={14} /> MADE FOR YOUR NEXT DISCOVERY
            </div>
            <h1>
              Good music.
              <br />
              <span>Worth sharing.</span>
            </h1>
            <p>
              From a SoundCloud link to a moving work of art.
              <br className="desktop-break" /> Your next find, ready for the
              feed.
            </p>
          </div>
          <form
            className="source-panel"
            onSubmit={(event) => {
              event.preventDefault();
              startJob("/api/imports", { url });
            }}
          >
            <div className="section-heading">
              <span className="step-number">01</span>
              <h2>Find your sound</h2>
              <span className="section-note">SOUNDCLOUD</span>
            </div>
            <label htmlFor="source">Song link</label>
            <div className="url-input">
              <Link size={19} />
              <input
                id="source"
                type="url"
                placeholder="https://soundcloud.com/artist/your-next-find"
                value={url}
                onChange={(event) => setUrl(event.target.value)}
                disabled={busy}
                required
              />
              <button
                type="submit"
                disabled={busy || !url || health?.ready === false}
                aria-label="Import track"
              >
                {loading ? (
                  <LoaderCircle className="spin" size={19} />
                ) : (
                  <ArrowRight size={20} />
                )}
              </button>
            </div>
            <div className="source-help">
              <span>Audio + cover art, pulled together.</span>
              <button
                type="button"
                className="text-button"
                disabled={busy}
                onClick={() => startJob("/api/demo", {})}
              >
                Try a demo <ChevronRight size={13} />
              </button>
            </div>
          </form>
          {health && !health.ready && (
            <div className="notice">
              Media tools need setup. Run <code>npm run setup</code> in the
              project folder, then reload.
            </div>
          )}
          {error && (
            <div role="alert" className="error-box">
              <span>{error}</span>
              <button
                className="icon-button"
                aria-label="Dismiss error"
                onClick={() => setError("")}
              >
                <X size={17} />
              </button>
            </div>
          )}
          {track && (
            <div className="track-card">
              {track.artworkUrl ? (
                <img src={track.artworkUrl} alt={`${track.title} cover`} />
              ) : (
                <Disc3 size={36} />
              )}
              <div>
                <strong>{track.title}</strong>
                <span>
                  {track.artist} <span className="separator">/</span>{" "}
                  {clock(track.duration)}
                </span>
                {track.artworkNote && <small>{track.artworkNote}</small>}
              </div>
              <span className="loaded">
                <Check size={14} />{" "}
                {track.source === "demo" ? "DEMO" : "IMPORTED"}
              </span>
            </div>
          )}
          <section className="clip-panel">
            <div className="section-heading">
              <span className="step-number">02</span>
              <h2>Make it yours</h2>
              <SlidersHorizontal size={16} />
            </div>
            <fieldset disabled={!track || busy}>
              <div className="label-row">
                <label htmlFor="start">Start at</label>
                <span className="mono">
                  {clock(options.start)}{" "}
                  <span className="muted">/ {clock(track?.duration || 0)}</span>
                </span>
              </div>
              <input
                id="start"
                type="range"
                min="0"
                max={Math.max(0, (track?.duration || 30) - options.duration)}
                step="0.1"
                value={options.start}
                onChange={(event) =>
                  updateClip({ start: Number(event.target.value) })
                }
              />
              <div className="clip-values">
                <label>
                  Start, seconds
                  <input
                    aria-label="Start in seconds"
                    type="number"
                    min="0"
                    max={Math.max(
                      0,
                      (track?.duration || 30) - options.duration,
                    )}
                    step="0.1"
                    value={Number(options.start.toFixed(1))}
                    onChange={(event) =>
                      updateClip({ start: Number(event.target.value) })
                    }
                  />
                </label>
                <label>
                  Length, seconds
                  <input
                    aria-label="Clip length in seconds"
                    type="number"
                    min="3"
                    max={Math.min(60, track?.duration || 60)}
                    step="0.1"
                    value={options.duration}
                    onChange={(event) =>
                      updateClip({ duration: Number(event.target.value) })
                    }
                  />
                </label>
              </div>
              <div className="duration-options">
                {[15, 30, 60].map((duration) => (
                  <button
                    type="button"
                    key={duration}
                    className={options.duration === duration ? "selected" : ""}
                    disabled={!track || duration > track.duration || busy}
                    onClick={() => updateClip({ duration })}
                  >
                    {duration}s
                  </button>
                ))}
                <span>Choose the part that hits.</span>
              </div>
            </fieldset>
            <div className="style-controls">
              <div>
                <label>Visual palette</label>
                <div className="swatches">
                  {Object.entries(THEMES).map(([id, theme]) => (
                    <button
                      type="button"
                      key={id}
                      disabled={busy}
                      aria-pressed={options.theme === id}
                      aria-label={`${theme.name} palette`}
                      className={
                        options.theme === id ? "swatch active" : "swatch"
                      }
                      onClick={() =>
                        setOptions((current) => ({ ...current, theme: id }))
                      }
                    >
                      <i style={{ background: theme.accent }} />
                      {theme.name}
                    </button>
                  ))}
                </div>
              </div>
              <label className="episode">
                Volume
                <input
                  aria-label="Volume number"
                  value={options.episode}
                  disabled={busy}
                  maxLength="3"
                  inputMode="numeric"
                  onChange={(event) =>
                    setOptions((current) => ({
                      ...current,
                      episode: event.target.value.replace(/\D/g, ""),
                    }))
                  }
                  onBlur={() =>
                    setOptions((current) => ({
                      ...current,
                      episode: current.episode || "001",
                    }))
                  }
                />
              </label>
            </div>
          </section>
          <section className="lyrics-panel">
            <div className="section-heading">
              <span className="step-number">03</span>
              <h2>Let the lyrics speak</h2>
              <span className="section-note">WORD BY WORD</span>
            </div>
            <p className="section-copy">
              Pull the words from your selected clip. Watch them light up with
              the vocals.
            </p>
            <div className="transcribe-controls">
              <label>
                Vocal language
                <select
                  value={language}
                  onChange={(event) => setLanguage(event.target.value)}
                  disabled={busy}
                >
                  {[
                    "auto",
                    "english",
                    "spanish",
                    "french",
                    "german",
                    "portuguese",
                    "italian",
                    "japanese",
                    "korean",
                  ].map((value) => (
                    <option key={value} value={value}>
                      {value === "auto"
                        ? "Auto detect"
                        : value[0].toUpperCase() + value.slice(1)}
                    </option>
                  ))}
                </select>
              </label>
              <button
                className="secondary-button"
                disabled={!track || busy}
                onClick={() =>
                  startJob("/api/transcriptions", {
                    trackId: track.id,
                    start: options.start,
                    duration: options.duration,
                    language,
                  })
                }
              >
                Generate lyrics <AudioLines size={15} />
              </button>
            </div>
            {captionMessage && (
              <p className="caption-message" role="status">
                {captionMessage}
              </p>
            )}
            <details className="caption-editor">
              <summary>
                Review & edit lyrics{" "}
                <span>{options.captions.length} lines</span>
              </summary>
              <label htmlFor="captions">Seconds into this clip → lyrics</label>
              <textarea
                id="captions"
                disabled={!track || busy}
                value={captionText}
                onChange={(event) => setCaptionText(event.target.value)}
                placeholder={
                  "0.50 --> 2.40 | Your lyrics go here\n2.60 --> 4.80 | And the next line here"
                }
                spellCheck="false"
              />
              <p>
                One phrase per line. Change the text or times, then apply.
                Edited phrases use evenly spaced word highlights.
              </p>
              <div className="caption-actions">
                <button
                  className="secondary-button"
                  disabled={!track || busy}
                  onClick={applyCaptions}
                >
                  Apply lyrics <Check size={14} />
                </button>
                <button
                  className="text-button"
                  disabled={busy}
                  onClick={() => {
                    setCaptionText("");
                    setOptions((current) => ({ ...current, captions: [] }));
                    setCaptionMessage("Instrumental mode: no lyric captions.");
                  }}
                >
                  Clear lyrics
                </button>
              </div>
            </details>
            {captionDirty && (
              <p className="caption-message">
                Apply your lyric edits before generating the video.
              </p>
            )}
          </section>
          <section className="branding-panel">
            <div className="section-heading">
              <span className="step-number">04</span>
              <h2>Signed, SoundCloud Finds</h2>
            </div>
            <label className="toggle-row">
              <input
                type="checkbox"
                checked={options.branded}
                disabled={busy}
                onChange={(event) => {
                  seekPreview(0);
                  setOptions((current) => ({
                    ...current,
                    branded: event.target.checked,
                  }));
                }}
              />
              <span>Animated intro, outro & thank-you ending</span>
            </label>
            <p className="section-copy">
              Music starts first. The logo arrives at 2.5s, returns after the
              clip, then fades to a black thank-you card.
            </p>
            <div className="timeline-strip">
              <span>MUSIC</span>
              <i />
              <span>LOGO OUTRO · 3.2s</span>
              <i />
              <span>THANK YOU · 3s</span>
            </div>
          </section>
          <section className="export-panel">
            <div className="export-spec">
              <span>
                <Check size={15} />
                1080 × 1920
              </span>
              <span>9:16 portrait</span>
              <span>30 FPS</span>
              <span>MP4</span>
            </div>
            <button
              type="button"
              className="export-button"
              disabled={
                !track || busy || !analysis || !options.episode || captionDirty
              }
              onClick={() =>
                startJob("/api/renders", { trackId: track.id, ...options })
              }
            >
              {busy ? (
                <>
                  <LoaderCircle size={18} className="spin" />
                  {job?.type === "render"
                    ? "Creating your video"
                    : job?.type === "transcribe"
                      ? "Listening for lyrics"
                      : "Preparing your sound"}
                </>
              ) : (
                <>
                  <span>
                    Generate video ·{" "}
                    {totalDuration(options.duration, options.branded).toFixed(
                      1,
                    )}
                    s
                  </span>
                  <ArrowRight size={20} />
                </>
              )}
            </button>
            <p className="footnote">
              Use music and artwork you have permission to share.
            </p>
          </section>
          {active(job) && (
            <div className="job-progress" role="status" aria-live="polite">
              <div>
                <span>{job.message}</span>
                <strong>{job.progress}%</strong>
              </div>
              <progress max="100" value={job.progress} />
              <button
                className="text-button"
                onClick={() =>
                  api(`/api/jobs/${job.id}/cancel`, {})
                    .then(setJob)
                    .catch((error) => setError(error.message))
                }
              >
                Cancel job
              </button>
            </div>
          )}
          {result && (
            <div className="download-panel" role="status">
              <div>
                <Check size={18} />
                <strong>Your find is ready.</strong>
              </div>
              <a className="download-link" href={result.downloadUrl}>
                <ArrowDownToLine size={17} /> Download MP4
              </a>
            </div>
          )}
          {result?.description && (
            <section className="description-panel">
              <div className="section-heading">
                <h2>Ready to post</h2>
                <span className="section-note">YOUR VIDEO DESCRIPTION</span>
              </div>
              <div className="description-credit">
                {result.artworkUrl && (
                  <img
                    src={result.artworkUrl}
                    alt={`Album artwork for ${result.title}`}
                  />
                )}
                <div>
                  <strong>{result.title}</strong>
                  <span>{result.artist}</span>
                </div>
              </div>
              <label className="sr-only" htmlFor="description">
                Generated video description
              </label>
              <textarea id="description" value={result.description} readOnly />
              <div className="caption-actions">
                <button className="secondary-button" onClick={copyDescription}>
                  {copied ? "Copied" : "Copy description"} <Check size={14} />
                </button>
                <a className="text-button" href={result.descriptionUrl}>
                  Save .txt
                </a>
                {result.artworkUrl && (
                  <a className="text-button" href={result.artworkUrl}>
                    Cover art
                  </a>
                )}
                <a className="text-button" href={result.captionsUrl}>
                  Subtitles .srt
                </a>
              </div>
              <div className="tiktok-panel">
                {!tiktok?.configured ? (
                  <p className="caption-message">
                    To send videos to TikTok drafts, add TIKTOK_CLIENT_KEY and
                    TIKTOK_CLIENT_SECRET to .env and restart the app.
                  </p>
                ) : !tiktok.connected ? (
                  <a className="secondary-button" href="/api/tiktok/connect">
                    Connect TikTok <ArrowRight size={14} />
                  </a>
                ) : (
                  <div className="caption-actions">
                    <button
                      className="secondary-button"
                      onClick={sendToTiktok}
                      disabled={busy}
                    >
                      Send to TikTok drafts <ArrowRight size={14} />
                    </button>
                    <span className="section-note">
                      {tiktok.displayName ? `@${tiktok.displayName}` : "Connected"}
                    </span>
                    <button className="text-button" onClick={disconnectTiktok}>
                      Disconnect
                    </button>
                  </div>
                )}
                {tiktokMessage && (
                  <p className="caption-message" role="status">
                    {tiktokMessage}
                  </p>
                )}
              </div>
            </section>
          )}
        </section>
        <section className="preview-section" aria-label="Video preview">
          <div className="preview-heading">
            <span>
              <span className="live-dot" />{" "}
              {result ? "FINISHED VIDEO" : "LIVE PREVIEW"}
            </span>
            <span>9:16</span>
          </div>
          <div className="video-stage">
            {result ? (
              <video
                controls
                playsInline
                src={result.videoUrl}
                poster={result.posterUrl}
                aria-label="Finished SoundCloud Finds video"
              />
            ) : (
              <Preview
                track={track}
                analysis={analysis}
                options={options}
                audioRef={audioRef}
                playbackRef={playbackRef}
                onTick={setPlayTime}
                onPlaying={setPlaying}
              />
            )}
          </div>
          {result && (
            <a className="video-download" href={result.downloadUrl}>
              <ArrowDownToLine size={18} /> Download MP4
            </a>
          )}
          <div className="playback-controls">
            <button
              className="icon-button"
              aria-label="Restart preview"
              disabled={!track || busy || Boolean(result)}
              onClick={() => seekPreview(0)}
            >
              <RotateCcw size={16} />
            </button>
            <button
              className="play-button"
              aria-label={playing ? "Pause preview" : "Play preview"}
              onClick={togglePlay}
              disabled={!track || busy || Boolean(result)}
            >
              {playing ? (
                <Pause size={17} fill="currentColor" />
              ) : (
                <Play size={17} fill="currentColor" />
              )}
            </button>
            <span className="mono">
              {clock(playTime)}{" "}
              <span>
                / {clock(totalDuration(options.duration, options.branded))}
              </span>
            </span>
            <Headphones size={16} className="headphones" />
          </div>
          {!result && (
            <div className="preview-timeline">
              <input
                aria-label="Preview timeline"
                type="range"
                min="0"
                max={totalDuration(options.duration, options.branded) - 0.04}
                step="0.04"
                value={Math.min(
                  playTime,
                  totalDuration(options.duration, options.branded) - 0.04,
                )}
                disabled={!track || busy}
                onChange={(event) => seekPreview(Number(event.target.value))}
              />
              <div className="scene-buttons">
                <button
                  disabled={!track || busy}
                  onClick={() =>
                    seekPreview(Math.min(3.8, options.duration - 0.1))
                  }
                >
                  Intro
                </button>
                <button
                  disabled={!track || busy}
                  onClick={() => seekPreview(Math.min(7, options.duration / 2))}
                >
                  Music
                </button>
                <button
                  disabled={!track || busy || !options.branded}
                  onClick={() => seekPreview(options.duration + 1.5)}
                >
                  Outro
                </button>
                <button
                  disabled={!track || busy || !options.branded}
                  onClick={() => seekPreview(options.duration + 5)}
                >
                  Thank you
                </button>
                <span>
                  {timeline(playTime, options.duration, options.branded).stage}
                </span>
              </div>
            </div>
          )}
          {result ? (
            <button
              className="text-button back-edit"
              onClick={() => setResult(null)}
            >
              Back to live preview <ArrowRight size={14} />
            </button>
          ) : (
            <p className="preview-note">
              Real sound. Real movement. Every frame follows the music.
            </p>
          )}
          <div className="preview-features">
            <span>
              <AudioLines size={16} /> Audio-reactive spectrum
            </span>
            <span>
              <Disc3 size={16} /> Original cover art
            </span>
          </div>
        </section>
      </main>
      {exports.length > 0 && (
        <section className="recent">
          <div className="section-heading">
            <h2>Your exports</h2>
            <span className="section-note">SAVED LOCALLY</span>
          </div>
          <div className="export-list">
            {exports.slice(0, 4).map((item) => (
              <button
                type="button"
                className="export-history-item"
                key={item.id}
                onClick={() => {
                  seekPreview(0);
                  setResult(item.result);
                  setCopied(false);
                }}
              >
                <img src={item.result.posterUrl} alt="" />
                <div>
                  <strong>{item.result.title}</strong>
                  <span>{item.result.duration}s · 1080 × 1920</span>
                </div>
                <ArrowRight size={18} />
              </button>
            ))}
          </div>
        </section>
      )}
      <footer>
        <span>
          FINDS STUDIO <span className="separator">/</span> A LITTLE LESS
          SCROLLING. A LITTLE MORE LISTENING.
        </span>
        <a href="https://www.kscomputing.biz" target="_blank" rel="noreferrer">
          K&S COMPUTING <ArrowRight size={12} />
        </a>
      </footer>
      {track && (
        <audio
          ref={audioRef}
          src={track.audioUrl}
          preload="auto"
          onLoadedMetadata={() => {
            audioRef.current.currentTime = options.start;
          }}
        />
      )}
    </div>
  );
}
