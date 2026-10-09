import { timeline, ease } from "./timeline.mjs";
import { drawLogo } from "./logo.mjs";
import { drawCaptions } from "./caption-drawing.mjs";

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
    analysis?.frames[
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
  if (phase.stage === "outro") {
    ctx.fillStyle = colors.bg;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    const glow = ctx.createRadialGradient(470, 740, 5, 470, 740, 730);
    glow.addColorStop(0, `${colors.accent}28`);
    glow.addColorStop(1, `${colors.accent}00`);
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, WIDTH, HEIGHT);
    drawLogo(ctx, {
      x: 470,
      y: 750,
      accent: colors.accent,
      reveal: phase.logo,
    });
    ctx.globalAlpha = ease(phase.local / 0.5) * ease((3.2 - phase.local) / 0.5);
    if (art) ctx.drawImage(art, 406, 1256, 128, 128);
    ctx.textAlign = "center";
    wrap(ctx, track?.title || "", 720, 30, 2).forEach((line, i) =>
      text(ctx, line, 470, 1450 + i * 39, 30, "#fff", 700),
    );
    text(
      ctx,
      wrap(ctx, track?.artist || "", 720, 23, 1)[0],
      470,
      1560,
      23,
      colors.secondary,
      500,
    );
    ctx.restore();
    return;
  }
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  const glow = ctx.createRadialGradient(520, 700, 60, 520, 700, 1030);
  glow.addColorStop(0, `${colors.accent}38`);
  glow.addColorStop(1, `${colors.accent}00`);
  ctx.fillStyle = glow;
  ctx.fillRect(0, 0, WIDTH, HEIGHT);
  // Quiet coordinate grid and orbit traces give the visual a record-sleeve feel.
  ctx.strokeStyle = "#ffffff08";
  ctx.lineWidth = 1;
  for (let x = 70; x < WIDTH; x += 70) {
    ctx.beginPath();
    ctx.moveTo(x, 0);
    ctx.lineTo(x, HEIGHT);
    ctx.stroke();
  }
  for (let y = 60; y < HEIGHT; y += 70) {
    ctx.beginPath();
    ctx.moveTo(0, y);
    ctx.lineTo(WIDTH, y);
    ctx.stroke();
  }
  ctx.strokeStyle = `${colors.accent}32`;
  ctx.lineWidth = 2;
  for (let i = 0; i < 3; i++) {
    ctx.beginPath();
    ctx.ellipse(
      474,
      760,
      406 + i * 32 + frame.peak * 9,
      416 + i * 32,
      time * 0.08,
      0,
      Math.PI * 2,
    );
    ctx.stroke();
  }

  ctx.fillStyle = colors.accent;
  ctx.beginPath();
  ctx.arc(119, 162, 7, 0, Math.PI * 2);
  ctx.fill();
  text(ctx, "THE DISCOVERY SERIES", 142, 171, 22, "#ffffffb8", 500);
  text(
    ctx,
    `VOL. ${episode.padStart(3, "0")}`,
    714,
    171,
    21,
    colors.secondary,
    500,
  );
  text(ctx, "SOUNDCLOUD", 110, 252, 50, "#ffffff", 700);
  text(ctx, "FINDS", 104, 348, 111, colors.accent, 800);
  rule(ctx, 110, 379, 720, "#ffffff30");

  const size = 720;
  ctx.save();
  ctx.translate(470, 764);
  const scale = 1 + Math.min(1, frame.peak) * 0.006;
  ctx.scale(scale, scale);
  ctx.shadowColor = "#00000088";
  ctx.shadowBlur = 60;
  ctx.fillStyle = colors.bg;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.shadowBlur = 0;
  if (art) {
    const side = Math.min(art.width, art.height);
    ctx.drawImage(
      art,
      (art.width - side) / 2,
      (art.height - side) / 2,
      side,
      side,
      -size / 2,
      -size / 2,
      size,
      size,
    );
  } else {
    const gradient = ctx.createLinearGradient(-360, -360, 360, 360);
    gradient.addColorStop(0, colors.accent);
    gradient.addColorStop(1, colors.bg);
    ctx.fillStyle = gradient;
    ctx.fillRect(-360, -360, 720, 720);
    text(ctx, "YOUR NEXT", -288, -10, 56, "#fff", 700);
    text(ctx, "FAVORITE.", -288, 70, 70, "#fff", 800);
  }
  ctx.restore();
  drawCaptions(ctx, captions, time, colors.accent);
  text(ctx, "01 / ON REPEAT", 110, 1155, 18, colors.secondary, 500);
  const titleLines = wrap(
    ctx,
    track?.title || "A good find deserves a moment.",
    720,
    37,
    2,
  );
  titleLines.forEach((line, i) =>
    text(ctx, line, 110, 1211 + i * 46, 37, "#fff", 700),
  );
  const artist = wrap(
    ctx,
    track?.artist || "Paste a track. Make it move.",
    720,
    24,
    1,
  )[0];
  text(ctx, artist, 110, 1300, 24, "#ffffffa8", 500);

  text(ctx, "FREQUENCY SPECTRUM", 110, 1351, 17, "#ffffffa8", 500);
  text(ctx, "40 Hz — 7.2 kHz", 650, 1351, 16, "#ffffff80", 400);
  const gap = 5,
    barWidth = (720 - gap * 55) / 56;
  const gradient = ctx.createLinearGradient(0, 1370, 0, 1477);
  gradient.addColorStop(0, colors.secondary);
  gradient.addColorStop(1, colors.accent);
  ctx.fillStyle = gradient;
  frame.bands.forEach((value, i) => {
    const barHeight = Math.max(3, value * 108);
    ctx.fillRect(
      110 + i * (barWidth + gap),
      1477 - barHeight,
      barWidth,
      barHeight,
    );
  });
  rule(ctx, 110, 1487, 720, "#ffffff20");

  const points = wave || clipWaveform(analysis, start, duration);
  points.forEach((value, i) => {
    const barHeight = Math.max(3, value * 70);
    ctx.fillStyle = i / points.length <= progress ? colors.accent : "#ffffff35";
    ctx.fillRect(
      110 + (i * 720) / points.length,
      1550 - barHeight / 2,
      3.5,
      barHeight,
    );
  });
  ctx.fillStyle = "#ffffff";
  ctx.fillRect(110 + progress * 720, 1510, 2, 80);
  text(ctx, clock(start + phase.musicTime), 110, 1616, 20, "#fff", 500);
  text(ctx, clock(start + duration), 771, 1616, 20, "#ffffff80", 500);
  rule(ctx, 110, 1640, 720, "#ffffff20");
  text(ctx, "LEVEL", 110, 1681, 15, "#ffffff80", 500);
  text(ctx, `${frame.rms} dBFS`, 110, 1717, 25, colors.secondary, 600);
  text(ctx, "BRIGHTNESS", 383, 1681, 15, "#ffffff80", 500);
  text(
    ctx,
    `${(frame.centroid / 1000).toFixed(2)} kHz`,
    383,
    1717,
    25,
    colors.secondary,
    600,
  );
  text(ctx, "FORMAT", 685, 1681, 15, "#ffffff80", 500);
  text(ctx, "9:16 / 30", 685, 1717, 25, colors.secondary, 600);
  text(ctx, "GOOD MUSIC. FOUND HERE.", 110, 1810, 18, "#ffffff60", 500);
  if (phase.logo > 0) {
    const veilHeight = captions.length ? 480 : 720;
    const veil = ctx.createLinearGradient(0, 404, 0, 404 + veilHeight);
    veil.addColorStop(0, "rgba(6, 9, 15, 0)");
    veil.addColorStop(0.12, `rgba(6, 9, 15, ${phase.logo * 0.94})`);
    veil.addColorStop(0.83, `rgba(6, 9, 15, ${phase.logo * 0.94})`);
    veil.addColorStop(1, "rgba(6, 9, 15, 0)");
    ctx.fillStyle = veil;
    ctx.fillRect(110, 404, 720, veilHeight);
    drawLogo(ctx, {
      x: 470,
      y: captions.length ? 575 : 673,
      scale: captions.length ? 0.59 : 0.86,
      accent: colors.accent,
      reveal: phase.logo,
    });
  }
  ctx.restore();
}
