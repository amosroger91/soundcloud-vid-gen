// Every motion decision comes from the clip and its timestamp, so scrubbing,
// browser playback, and an offline export produce the same choreography.
export const MOTION_STYLES = {
  dynamic: {
    name: "Dynamic",
    description: "Music-led cuts, moving artwork, and punchy accents.",
  },
  drift: {
    name: "Drift",
    description: "Longer scenes, gentle movement, and softer transitions.",
  },
};

const clamp = (value, min = 0, max = 1) =>
  Math.min(max, Math.max(min, Number.isFinite(value) ? value : min));
const ease = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
const finite = (value, fallback) =>
  Number.isFinite(Number(value)) ? Number(value) : fallback;

function settings(options = {}) {
  const track = options.track || {};
  return {
    identity: [track.sourceUrl || "", track.title || "", track.artist || ""],
    start: Math.max(0, finite(options.start, 0)),
    duration: Math.max(0, finite(options.duration, 30)),
    episode: String(options.episode ?? "001"),
    variation: Math.floor(finite(options.variation, 0)),
    motion: options.motion === "drift" ? "drift" : "dynamic",
  };
}

function hash(value) {
  let seed = 2166136261;
  for (const char of value) {
    seed ^= char.codePointAt(0);
    seed = Math.imul(seed, 16777619);
  }
  return seed >>> 0;
}

function randomFrom(seed) {
  return () => {
    seed += 0x6d2b79f5;
    let value = seed;
    value = Math.imul(value ^ (value >>> 15), value | 1);
    value ^= value + Math.imul(value ^ (value >>> 7), value | 61);
    return ((value ^ (value >>> 14)) >>> 0) / 4294967296;
  };
}

function average(bands, from, to) {
  let sum = 0;
  for (let i = from; i < to; i++) sum += clamp(bands[i]);
  return sum / Math.max(1, to - from);
}

function measure(frame) {
  const bands = frame?.bands || [];
  const rms = finite(frame?.rms, -60);
  // Gate log-scaled FFT values near silence instead of turning noise into motion.
  const gate = clamp((rms + 60) / 24);
  return {
    energy: clamp((rms + 48) / 42),
    bass: average(bands, 0, Math.min(18, bands.length)) * gate,
    treble: average(bands, Math.min(37, bands.length), bands.length) * gate,
    bands,
  };
}

function musicSamples(analysis, start, duration) {
  const fps = Math.max(1, finite(analysis?.fps, 30));
  const source = Array.isArray(analysis?.frames) ? analysis.frames : [];
  // Include source context before the clip so a nonzero start is not a fake beat.
  const origin = Math.max(0, Math.floor(start * fps) - Math.ceil(fps * 0.75));
  const last = Math.min(source.length - 1, Math.ceil((start + duration) * fps));
  const samples = [];
  const flux = [];
  let previous = measure(source[Math.max(0, origin - 1)]);
  for (let index = origin; index <= last; index++) {
    const current = measure(source[index]);
    let rise = 0;
    const count = Math.max(current.bands.length, previous.bands.length);
    for (let band = 0; band < count; band++)
      rise += Math.max(0, clamp(current.bands[band]) - clamp(previous.bands[band]));
    const score =
      (rise / Math.max(1, count)) * 0.8 +
      Math.max(0, current.energy - previous.energy) * 0.2;
    flux.push(current.energy > 0 ? score : 0);
    samples.push({ energy: current.energy, bass: current.bass, treble: current.treble });
    previous = current;
  }

  const onsets = [];
  const lookback = Math.max(2, Math.round(fps * 0.4));
  for (let i = 0; i < flux.length; i++) {
    const time = (origin + i) / fps - start;
    if (time < 0 || time >= duration) continue;
    const score = flux[i];
    let sum = 0;
    const first = Math.max(0, i - lookback);
    for (let j = first; j < i; j++) sum += flux[j];
    const threshold = Math.max(0.012, (sum / Math.max(1, i - first)) * 1.55);
    if (
      score < threshold ||
      score < (flux[i - 1] || 0) ||
      score <= (flux[i + 1] || 0)
    ) continue;
    const event = { time, strength: score };
    const preceding = onsets.at(-1);
    // One drum attack may span multiple FFT windows; retain its strongest peak.
    if (preceding && time - preceding.time < 0.24) {
      if (event.strength > preceding.strength) onsets[onsets.length - 1] = event;
    } else onsets.push(event);
  }

  // Match each clip's dynamics instead of requiring every track to have the
  // same mastering level. A floor prevents tiny FFT changes becoming big hits.
  const strengths = onsets.map((event) => event.strength).sort((a, b) => a - b);
  const reference = Math.max(0.04, strengths[Math.floor((strengths.length - 1) * 0.9)] || 0);
  for (const event of onsets) event.strength = clamp(0.2 + 0.8 * event.strength / reference);

  // A small causal kernel gives smooth movement without a draw-history buffer.
  const smoothed = samples.map((sample, i) => {
    const before = samples[Math.max(0, i - 1)];
    const earlier = samples[Math.max(0, i - 2)];
    return Object.fromEntries(["energy", "bass", "treble"].map((key) => [
      key, clamp(sample[key] * 0.55 + before[key] * 0.3 + earlier[key] * 0.15),
    ]));
  });
  return { fps, origin, samples: smoothed, onsets };
}

function repeatedPattern(kinds, kind, period) {
  const candidate = [...kinds, kind];
  if (candidate.length < period * 2) return false;
  const offset = candidate.length - period * 2;
  for (let i = 0; i < period; i++)
    if (candidate[offset + i] !== candidate[offset + period + i]) return false;
  return true;
}

function shotsFor(duration, motion, onsets, random) {
  const minimum = motion === "drift" ? 6 : 3;
  const maximum = motion === "drift" ? 9 : 6;
  const least = Math.max(1, Math.ceil(duration / maximum));
  const most = Math.max(1, Math.floor(duration / minimum));
  // Very short clips may only have room for one complete scene.
  const count = most < least ? most : least + Math.floor(random() * (most - least + 1));
  const shots = [];
  const kinds = [];
  let start = 0;
  for (let index = 0; index < count; index++) {
    let available = ["sleeve", "orbit", "panorama"].filter((kind) => kind !== kinds.at(-1));
    const varied = available.filter((kind) =>
      !repeatedPattern(kinds, kind, 2) && !repeatedPattern(kinds, kind, 3),
    );
    if (varied.length) available = varied;
    const kind = available[Math.floor(random() * available.length)];
    kinds.push(kind);
    let end = duration;
    const remaining = count - index - 1;
    if (remaining) {
      const earliest = Math.max(start + minimum, duration - remaining * maximum);
      const latest = Math.min(start + maximum, duration - remaining * minimum);
      const target = earliest + random() * Math.max(0, latest - earliest);
      end = target;
      let best = Infinity;
      for (const onset of onsets) {
        if (onset.time < earliest || onset.time > latest) continue;
        const distance = Math.abs(onset.time - target);
        if (distance > (motion === "drift" ? 1 : 0.8)) continue;
        const cost = distance - onset.strength * 0.2;
        if (cost < best) {
          best = cost;
          end = onset.time;
        }
      }
    }
    shots.push({ start, end, kind });
    start = end;
  }
  return shots;
}

export function createDirection(options = {}) {
  const config = settings(options);
  const seed = hash(JSON.stringify(config));
  const music = musicSamples(options.analysis, config.start, config.duration);
  return {
    seed,
    motion: config.motion,
    start: config.start,
    duration: config.duration,
    shots: shotsFor(config.duration, config.motion, music.onsets, randomFrom(seed)),
    ...music,
  };
}

const analysisCache = new WeakMap();
const emptyCache = new Map();
export function getDirection(options = {}) {
  const analysis = options.analysis;
  let cache = emptyCache;
  if (analysis && typeof analysis === "object") {
    if (!analysisCache.has(analysis)) analysisCache.set(analysis, new Map());
    cache = analysisCache.get(analysis);
  }
  const key = JSON.stringify(settings(options));
  if (cache.has(key)) return cache.get(key);
  const plan = createDirection(options);
  // Scrubbing clip bounds should not retain unlimited copies of analysis data.
  if (cache.size >= 24) cache.delete(cache.keys().next().value);
  cache.set(key, plan);
  return plan;
}

export function directionAt(plan, time = 0) {
  const at = clamp(finite(time, 0), 0, plan.duration);
  let index = plan.shots.findIndex((shot) => at < shot.end);
  if (index < 0) index = plan.shots.length - 1;
  const shot = plan.shots[index];
  const local = Math.max(0, at - shot.start);
  const position = Math.max(0, (plan.start + at) * plan.fps - plan.origin);
  const first = Math.floor(position);
  const silent = { energy: 0, bass: 0, treble: 0 };
  const before = plan.samples[Math.min(first, plan.samples.length - 1)] || silent;
  const after = plan.samples[Math.min(first + 1, plan.samples.length - 1)] || silent;
  const fraction = position - first;
  const interpolate = (key) => clamp(before[key] + (after[key] - before[key]) * fraction);
  let beat = 0;
  // Binary search keeps the envelope cost independent of song length.
  let low = 0, high = plan.onsets.length;
  while (low < high) {
    const mid = (low + high) >>> 1;
    if (plan.onsets[mid].time <= at) low = mid + 1;
    else high = mid;
  }
  for (let i = low - 1; i >= 0 && at - plan.onsets[i].time < 0.9; i--) {
    const event = plan.onsets[i];
    beat = Math.max(beat, event.strength * Math.exp(-(at - event.time) / (plan.motion === "drift" ? 0.26 : 0.18)));
  }
  return {
    shot,
    index,
    local,
    progress: clamp(local / Math.max(0.001, shot.end - shot.start)),
    transition: index === 0 ? 1 : ease(local / (plan.motion === "drift" ? 0.9 : 0.5)),
    beat: clamp(beat),
    energy: interpolate("energy"),
    bass: interpolate("bass"),
    treble: interpolate("treble"),
    seed: plan.seed,
  };
}
