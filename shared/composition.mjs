import { timeline, ease } from "./timeline.mjs";
import { drawLogo } from "./logo.mjs";
import { drawCaptions } from "./caption-drawing.mjs";
import { getDirection, directionAt } from "./direction.mjs";
import { drawAtmosphere, drawArtworkStage, SHOT_LABELS } from "./visuals.mjs";

export const THEMES = {
  ember: {
    name: "Ember",
    accent: "#ff7546",
    secondary: "#ffc798",
    bg: "#170e15",
  },
  ice: { name: "Ice", accent: "#65c9ff", secondary: "#cbebff", bg: "#0b1521" },
  violet: {
    name: "Violet",
    accent: "#bd91ff",
    secondary: "#f3c1fa",
    bg: "#160e25",
  },
};
export const WIDTH = 1080;
export const HEIGHT = 1920;
export const clock = (seconds) =>
  `${Math.floor(Math.max(0, seconds) / 60)}:${String(Math.floor(Math.max(0, seconds) % 60)).padStart(2, "0")}`;

function text(ctx, value, x, y, size, color = "#fff", weight = 600) {
  ctx.fillStyle = color;
  ctx.font = `${weight} ${size}px Montserrat, Arial, sans-serif`;
  ctx.fillText(value, x, y);
}
function rule(ctx, x, y, width, color) {
  ctx.fillStyle = color;
  ctx.fillRect(x, y, width, 1);
}
function wrap(ctx, value, width, size, maxLines = 2) {
  ctx.font = `700 ${size}px Montserrat, Arial, sans-serif`;
  const lines = [""];
  for (const char of Array.from(value)) {
    const last = lines.length - 1;
    if (ctx.measureText(lines[last] + char).width <= width) lines[last] += char;
    else if (lines.length < maxLines) lines.push(char.trimStart());
    else {
      while (ctx.measureText(lines[last] + "…").width > width)
        lines[last] = lines[last].slice(0, -1);
      lines[last] += "…";
      break;
    }
  }
  return lines;
}
export function frameAt(analysis, time) {
  return (
    analysis?.frames?.[
      Math.min(
        analysis.frames.length - 1,
        Math.max(0, Math.floor(time * analysis.fps)),
      )
    ] || { bands: Array(56).fill(0), rms: -60, centroid: 0, peak: 0 }
  );
}
export function clipWaveform(analysis, start, duration, count = 110) {
  if (!analysis) return Array(count).fill(0.02);
  return Array.from({ length: count }, (_, i) => {
    const first = Math.floor(
      (start + (duration * i) / count) * analysis.waveformRate,
    );
    const last = Math.max(
      first + 1,
      Math.ceil((start + (duration * (i + 1)) / count) * analysis.waveformRate),
    );
    let peak = 0;
    for (let j = first; j < last; j++)
      peak = Math.max(peak, analysis.waveform[j] || 0);
    return peak;
  });
}

const BASE_LAYOUT = {
  header: { seriesY: 171, markY: 252, markSize: 50, findsY: 348, findsSize: 111, ruleY: 379 },
  art: { x: 470, y: 764, size: 720 },
  onRepeatY: 1155,
  titleY: 1211,
  titleSize: 44,
  titleStep: 50,
  artistY: 1300,
  artistSize: 26,
  spectrumY: 1351,
  barBase: 1477,
  barMax: 108,
  waveY: 1550,
  waveMax: 70,
  timeY: 1616,
  ruleY: 1640,
  levelY: 1681,
  levelValueY: 1717,
  lyric: null,
};
const LYRIC_LAYOUT = {
  header: { seriesY: 158, markY: 230, markSize: 46, findsY: 312, findsSize: 92, ruleY: 342 },
  art: { x: 470, y: 640, size: 500 },
  onRepeatY: 948,
  titleY: 1000,
  titleSize: 38,
  titleStep: 44,
  artistY: 1096,
  artistSize: 22,
  spectrumY: 1376,
  barBase: 1468,
  barMax: 72,
  waveY: 1532,
  waveMax: 52,
  timeY: 1588,
  ruleY: 1612,
  levelY: 1656,
  levelValueY: 1692,
  lyric: { x: 110, y: 1136, width: 720, height: 196 },
};
export const frameLayout = (hasCaptions) =>
  hasCaptions ? LYRIC_LAYOUT : BASE_LAYOUT;

const LOGO_SCALE = 2.2;
const LOGO_LOCAL_CENTER = 50;

function drawBrandOverlay(ctx, accent, reveal) {
  ctx.save();
  ctx.globalAlpha = reveal;
  ctx.fillStyle = "#06090f";
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  ctx.restore();
  drawLogo(ctx, {
    x: WIDTH / 2,
    y: HEIGHT / 2 - LOGO_LOCAL_CENTER * LOGO_SCALE,
    scale: LOGO_SCALE,
    accent,
    reveal,
  });
}

export function drawFrame(
  ctx,
  {
    width = WIDTH,
    height = HEIGHT,
    track,
    art,
    analysis,
    wave,
    time = 0,
    start = 0,
    duration = 30,
    theme = "ember",
    episode = "001",
    branded = true,
    captions = [],
    motion = "dynamic",
    variation = 0,
  },
) {
  const colors = THEMES[theme] || THEMES.ember;
  const phase = timeline(time, duration, branded);
  const frame = frameAt(analysis, start + phase.musicTime);
  const progress = Math.max(0, Math.min(1, time / duration));
  ctx.save();
  ctx.scale(width / WIDTH, height / HEIGHT);
  if (phase.stage === "thanks") {
    ctx.fillStyle = "#000";
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    ctx.globalAlpha = ease(phase.local / 0.7);
    ctx.textAlign = "center";
    text(ctx, "THANKS FOR", 500, 839, 37, "#ffffff99", 500);
    text(ctx, "WATCHING", 500, 924, 75, "#fff", 800);
    ctx.fillStyle = colors.accent;
    ctx.fillRect(448, 974, 104, 3);
    text(ctx, "SOUNDCLOUD FINDS", 500, 1044, 22, colors.secondary, 600);
    const credit = wrap(
      ctx,
      `${track?.title || "Your next find"} — ${track?.artist || "Unknown artist"}`,
      700,
      23,
      2,
    );
    credit.forEach((line, index) =>
      text(ctx, line, 500, 1160 + index * 35, 23, "#ffffff80", 500),
    );
    ctx.restore();
    return;
  }
  const layout = frameLayout(captions.length > 0);
  const plan = getDirection({ track, analysis, start, duration, episode, motion, variation });
  const state = directionAt(plan, phase.musicTime);
  // Motion stops with the selected audio, so the silent outro has no phantom beats.
  if (phase.stage !== "music") state.beat = 0;
  const visual = { art, colors, layout, state, time: phase.musicTime, frame, motion };
  drawAtmosphere(ctx, visual);
  if (state.index > 0 && state.transition < 1) {
    const previous = directionAt(plan, state.shot.start - 1 / 30);
    drawArtworkStage(ctx, { ...visual, state: previous, alpha: 1 - state.transition });
  }
  drawArtworkStage(ctx, { ...visual, alpha: state.transition });

  const header = layout.header;
  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(119, header.seriesY - 9, 7, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, "THE DISCOVERY SERIES", 142, header.seriesY, 22, "#ffffffb8", 500);
  text(
    ctx,
    `VOL. ${episode.padStart(3, "0")}`,
    714,
    header.seriesY,
    21,
    colors.secondary,
    500,
  );
  text(ctx, "SOUNDCLOUD", 110, header.markY, header.markSize, "#ffffff", 700);
  text(ctx, "FINDS", 104, header.findsY, header.findsSize, colors.accent, 800);
  rule(ctx, 110, header.ruleY, 720, "#ffffff30");

  text(ctx, `${String(state.index + 1).padStart(2, "0")} / ${SHOT_LABELS[state.shot.kind]}`,
    110, layout.onRepeatY, 18, colors.secondary, 500);
  const titleLines = wrap(
    ctx,
    track?.title || "A good find deserves a moment.",
    720,
    layout.titleSize,
    2,
  );
  titleLines.forEach((line, i) =>
    text(
      ctx,
      line,
      110,
      layout.titleY + i * layout.titleStep,
      layout.titleSize,
      "#fff",
      700,
    ),
  );
  const artist = wrap(
    ctx,
    track?.artist || "Paste a track. Make it move.",
    720,
    layout.artistSize,
    1,
  )[0];
  text(ctx, artist, 110, layout.artistY, layout.artistSize, "#ffffffa8", 500);
  if (layout.lyric)
    drawCaptions(ctx, captions, time, colors.accent, layout.lyric);

  text(ctx, "FREQUENCY SPECTRUM", 110, layout.spectrumY, 17, "#ffffffa8", 500);
  const gap = 5,
    barWidth = (720 - gap * 55) / 56;
  const gradient = ctx.createLinearGradient(
    0,
    layout.barBase - layout.barMax,
    0,
    layout.barBase,
  );
  gradient.addColorStop(0, colors.secondary);
  gradient.addColorStop(1, colors.accent);
  ctx.fillStyle = gradient;
  frame.bands.forEach((value, i) => {
    const barHeight = Math.max(3, value * layout.barMax);
    ctx.fillRect(
      110 + i * (barWidth + gap),
      layout.barBase - barHeight,
      barWidth,
      barHeight,
    );
  });
  ctx.save();
  ctx.globalAlpha = 0.22;
  frame.bands.forEach((value, i) => {
    ctx.fillRect(110 + i * (barWidth + gap), layout.barBase + 4,
      barWidth, Math.max(2, value * 12));
  });
  ctx.restore();
  rule(ctx, 110, layout.barBase + 10, 720, "#ffffff20");

  const points = wave || clipWaveform(analysis, start, duration);
  points.forEach((value, i) => {
    const barHeight = Math.max(3, value * layout.waveMax);
    ctx.fillStyle = i / points.length <= progress ? colors.accent : "#ffffff35";
    ctx.fillRect(
      110 + (i * 720) / points.length,
      layout.waveY - barHeight / 2,
      3.5,
      barHeight,
    );
  });
  const playhead = layout.waveMax + 10;
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(
    110 + progress * 720,
    layout.waveY - playhead / 2,
    2,
    playhead,
  );
  text(ctx, clock(start + phase.musicTime), 110, layout.timeY, 20, "#fff", 500);
  text(
    ctx,
    clock(start + duration),
    771,
    layout.timeY,
    20,
    "#ffffff80",
    500,
  );
  rule(ctx, 110, layout.ruleY, 720, "#ffffff20");
  text(ctx, "LEVEL", 110, layout.levelY, 15, "#ffffff80", 500);
  text(
    ctx,
    `${frame.rms} dBFS`,
    110,
    layout.levelValueY,
    25,
    colors.secondary,
    600,
  );
  if (phase.logo > 0) drawBrandOverlay(ctx, colors.accent, phase.logo);
  ctx.restore();
}
