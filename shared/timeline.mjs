export const INTRO_DELAY = 2.5;
export const LOGO_DURATION = 3.2;
export const THANKS_DURATION = 6;
export const clamp = (value, min = 0, max = 1) =>
  Math.max(min, Math.min(max, value));
export const ease = (value) => {
  const t = clamp(value);
  return t * t * (3 - 2 * t);
};
export const totalDuration = (duration, branded = true) =>
  duration + (branded ? LOGO_DURATION + THANKS_DURATION : 0);
export function logoEnvelope(time, length = LOGO_DURATION) {
  return ease(time / 0.8) * ease((length - time) / 0.8);
}
export function timeline(time, duration, branded = true) {
  if (time < duration || !branded) {
    const introLength = Math.min(
      LOGO_DURATION,
      Math.max(0, duration - INTRO_DELAY),
    );
    const local = time - INTRO_DELAY;
    return {
      stage: "music",
      logo:
        branded && introLength >= 0.5 && local >= 0
          ? logoEnvelope(local, introLength)
          : 0,
      local,
      musicTime: clamp(time, 0, duration),
    };
  }
  if (branded && time < duration + LOGO_DURATION) {
    const local = time - duration;
    return {
      stage: "outro",
      logo: logoEnvelope(local),
      local,
      musicTime: duration,
    };
  }
  return {
    stage: "thanks",
    logo: 0,
    local: time - duration - (branded ? LOGO_DURATION : 0),
    musicTime: duration,
  };
}
