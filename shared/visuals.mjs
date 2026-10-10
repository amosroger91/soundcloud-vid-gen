// The artwork stage is clipped independently of the type and lyric safe areas.
// All motion is a function of time: seeking and exporting take the same path.
const TAU = Math.PI * 2;
const mix = (a, b, t) => a + (b - a) * t;

function cover(ctx, art, x, y, width, height, zoom = 1, panX = 0, panY = 0, colors) {
  if (!art) {
    const gradient = ctx.createLinearGradient(x, y, x + width, y + height);
    gradient.addColorStop(0, colors.secondary);
    gradient.addColorStop(0.45, colors.accent);
    gradient.addColorStop(1, colors.bg);
    ctx.fillStyle = gradient;
    ctx.fillRect(x, y, width, height);
    ctx.save();
    ctx.beginPath();
    ctx.rect(x, y, width, height);
    ctx.clip();
    ctx.strokeStyle = '#ffffff55';
    ctx.lineWidth = 2;
    for (let i = 0; i < 16; i++) {
      ctx.beginPath();
      ctx.ellipse(x + width * (0.45 + panX * 0.1), y + height * 0.5,
        width * (0.12 + i * 0.035) * zoom, height * (0.2 + i * 0.037), -0.55, 0, TAU);
      ctx.stroke();
    }
    ctx.restore();
    return;
  }
  const scale = Math.max(width / art.width, height / art.height) * zoom;
  const sw = width / scale, sh = height / scale;
  const sx = (art.width - sw) * (0.5 + panX * 0.5);
  const sy = (art.height - sh) * (0.5 + panY * 0.5);
  ctx.drawImage(art, sx, sy, sw, sh, x, y, width, height);
}

export function drawAtmosphere(ctx, { art, colors, layout, state, time, motion }) {
  ctx.fillStyle = colors.bg;
  ctx.fillRect(0, 0, 1080, 1920);
  // A slow overscan of the source cover gives every track its own environment.
  ctx.save();
  ctx.globalAlpha = 0.18;
  cover(ctx, art, 0, 0, 1080, 1350, 2.3, Math.sin(time * 0.07 + state.seed) * 0.35,
    -0.2 + Math.cos(time * 0.09) * 0.12, colors);
  ctx.restore();
  const light = ctx.createRadialGradient(
    380 + Math.sin(time * 0.15 + state.seed) * 180, layout.art.y - 100, 20,
    470, layout.art.y, 1000);
  light.addColorStop(0, `${colors.accent}36`);
  light.addColorStop(0.55, `${colors.accent}0d`);
  light.addColorStop(1, `${colors.accent}00`);
  ctx.save();
  ctx.globalAlpha = 0.65 + state.energy * 0.25 + state.beat * (motion === 'drift' ? 0.06 : 0.2);
  ctx.fillStyle = light;
  ctx.fillRect(0, 0, 1080, 1920);
  ctx.restore();
  // Keep all text on an opaque, quiet field, including gaps between lyrics.
  const shade = ctx.createLinearGradient(0, layout.onRepeatY - 140, 0, layout.onRepeatY);
  shade.addColorStop(0, '#090b1300');
  shade.addColorStop(1, '#090b13');
  ctx.fillStyle = shade;
  ctx.fillRect(0, layout.onRepeatY - 140, 1080, 140);
  ctx.fillStyle = '#090b13';
  ctx.fillRect(0, layout.onRepeatY, 1080, 1920 - layout.onRepeatY);
  const topShade = ctx.createLinearGradient(0, 0, 0, layout.header.ruleY + 90);
  topShade.addColorStop(0, '#070910d9');
  topShade.addColorStop(1, '#07091000');
  ctx.fillStyle = topShade;
  ctx.fillRect(0, 0, 1080, layout.header.ruleY + 90);

  // Sparse drifting motes occupy the artwork area, never the caption band.
  ctx.save();
  ctx.beginPath();
  ctx.rect(50, layout.header.ruleY + 8, 860, layout.onRepeatY - layout.header.ruleY - 32);
  ctx.clip();
  for (let i = 0; i < 22; i++) {
    const n = Math.sin((i + 1) * 127.1 + state.seed) * 43758.5453;
    const unit = n - Math.floor(n);
    const x = 50 + ((unit * 860 + time * (motion === 'drift' ? 3 : 7) * (i % 2 ? 1 : -1)) % 860 + 860) % 860;
    const y = layout.header.ruleY + 32 + ((i * 79.3 + time * (4 + unit * 5)) % (layout.onRepeatY - layout.header.ruleY - 74));
    ctx.globalAlpha = 0.12 + unit * 0.24;
    ctx.fillStyle = i % 3 ? colors.secondary : '#fff';
    const radius = 1 + unit * 1.5 + state.treble * 1.2;
    ctx.beginPath();
    ctx.arc(x, y, radius, 0, TAU);
    ctx.fill();
  }
  ctx.restore();
}

function sleeve(ctx, p) {
  const { art, colors, layout, state, time, strength } = p;
  const size = layout.art.size * 0.88;
  const tilt = Math.sin(time * 0.22 + state.seed) * 0.026 * strength;
  ctx.translate(layout.art.x, layout.art.y + Math.sin(time * 0.38 + state.seed) * 8 * strength);
  for (let i = 2; i > 0; i--) {
    ctx.save();
    ctx.rotate(tilt - i * 0.035);
    ctx.translate(i * 14, i * 4);
    ctx.globalAlpha *= 0.22 / i;
    cover(ctx, art, -size / 2, -size / 2, size, size, 1, 0, 0, colors);
    ctx.strokeStyle = colors.accent;
    ctx.lineWidth = 2;
    ctx.strokeRect(-size / 2, -size / 2, size, size);
    ctx.restore();
  }
  ctx.rotate(tilt);
  const scale = 1 + (state.beat * 0.024 + state.bass * 0.008) * strength + state.progress * 0.045;
  ctx.scale(scale, scale);
  ctx.shadowColor = '#00000080';
  ctx.shadowBlur = 26;
  ctx.fillStyle = colors.bg;
  ctx.fillRect(-size / 2, -size / 2, size, size);
  ctx.shadowBlur = 0;
  cover(ctx, art, -size / 2, -size / 2, size, size,
    1.025 + state.progress * 0.025, Math.sin(time * 0.16) * 0.35, 0, colors);
  ctx.strokeStyle = '#ffffff66';
  ctx.lineWidth = 1;
  ctx.strokeRect(-size / 2, -size / 2, size, size);
  // Offset registration corners echo a physical record sleeve.
  const edge = size / 2 + 14;
  ctx.strokeStyle = colors.secondary;
  ctx.lineWidth = 3;
  for (const sign of [-1, 1]) {
    ctx.beginPath();
    ctx.moveTo(sign * (edge - 32), -sign * edge);
    ctx.lineTo(sign * edge, -sign * edge);
    ctx.lineTo(sign * edge, -sign * (edge - 32));
    ctx.stroke();
  }
}

function orbit(ctx, p) {
  const { art, colors, layout, state, time, frame, strength } = p;
  const radius = layout.art.size * (layout.lyric ? 0.405 : 0.395);
  ctx.translate(layout.art.x, layout.art.y);
  ctx.save();
  ctx.beginPath();
  ctx.arc(0, 0, radius * (1 + state.beat * 0.014 * strength), 0, TAU);
  ctx.clip();
  cover(ctx, art, -radius - 6, -radius - 6, radius * 2 + 12, radius * 2 + 12,
    1.035 + state.progress * 0.055, Math.sin(time * 0.13 + state.seed) * 0.4, 0, colors);
  ctx.restore();
  // Each radial spoke is a real FFT band, with mirrored order around the disc.
  for (let i = 0; i < 112; i++) {
    const value = frame.bands[i < 56 ? i : 111 - i] || 0;
    const angle = i / 112 * TAU + time * 0.035;
    const inner = radius + 17;
    const outer = inner + 4 + value * (layout.lyric ? 32 : 50) + state.beat * 6 * strength;
    ctx.strokeStyle = i % 4 === 0 ? colors.secondary : colors.accent;
    ctx.lineWidth = i % 4 === 0 ? 3 : 2;
    ctx.beginPath();
    ctx.moveTo(Math.cos(angle) * inner, Math.sin(angle) * inner);
    ctx.lineTo(Math.cos(angle) * outer, Math.sin(angle) * outer);
    ctx.stroke();
  }
  ctx.strokeStyle = `${colors.secondary}65`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, 0, radius + (layout.lyric ? 63 : 65), 0, TAU);
  ctx.stroke();
  for (let i = 0; i < 2; i++) {
    const angle = time * 0.2 + i * Math.PI + state.seed;
    const r = radius + (layout.lyric ? 63 : 65);
    ctx.fillStyle = colors.secondary;
    ctx.beginPath();
    ctx.arc(Math.cos(angle) * r, Math.sin(angle) * r, 4, 0, TAU);
    ctx.fill();
  }
}

function panorama(ctx, p) {
  const { art, colors, layout, state, time, strength } = p;
  const height = layout.art.size * (layout.lyric ? 0.86 : 0.88);
  const y = layout.art.y - height / 2;
  const zoom = 1.08 + state.progress * 0.13 + state.beat * 0.018 * strength;
  const pan = Math.sin(state.seed + state.index * 1.3) * (state.progress * 1.4 - 0.7);
  // A widescreen crop with moving edge echoes changes the silhouette completely.
  ctx.save();
  ctx.globalAlpha *= 0.3;
  cover(ctx, art, 36, y - 30, 866, height + 60, zoom + 0.15, -pan, 0, colors);
  ctx.restore();
  cover(ctx, art, 90, y, 760, height, zoom, pan, Math.sin(time * 0.15) * 0.3, colors);
  const gradient = ctx.createLinearGradient(90, y, 90, y + height);
  gradient.addColorStop(0, '#04070a00');
  gradient.addColorStop(0.65, '#04070a00');
  gradient.addColorStop(1, '#04070a99');
  ctx.fillStyle = gradient;
  ctx.fillRect(90, y, 760, height);
  ctx.fillStyle = colors.accent;
  ctx.fillRect(90, y, 4, height);
  ctx.fillRect(90, y + height + 12, 760 * mix(0.16, 1, state.progress), 2);
  ctx.strokeStyle = '#ffffff55';
  ctx.lineWidth = 1;
  ctx.strokeRect(90, y, 760, height);
  ctx.font = '500 14px Montserrat, Arial, sans-serif';
  ctx.fillStyle = '#ffffffb0';
  ctx.fillText('S O U N D   I N   F O C U S', 114, y + height - 22);
}

export function drawArtworkStage(ctx, props) {
  const { layout, state, motion = 'dynamic', alpha = 1 } = props;
  ctx.save();
  ctx.globalAlpha *= alpha;
  ctx.beginPath();
  ctx.rect(36, layout.header.ruleY + 16, 884, layout.onRepeatY - layout.header.ruleY - 44);
  ctx.clip();
  const render = { sleeve, orbit, panorama }[state.shot.kind] || sleeve;
  render(ctx, { ...props, strength: motion === 'drift' ? 0.32 : 1 });
  ctx.restore();
}

export const SHOT_LABELS = { sleeve: 'COVER STUDY', orbit: 'IN THE ORBIT', panorama: 'SOUND IN FOCUS' };
