import { clamp, ease } from "./timeline.mjs";

// Original mark: a broken record orbit around a six-bar discovery pulse.
export const pulseHeights = [50, 94, 146, 184, 122, 70];
export function drawLogo(
  ctx,
  {
    x = 470,
    y = 790,
    scale = 1,
    accent = "#ff7546",
    reveal = 1,
    light = "#ffffff",
  } = {},
) {
  const p = ease(reveal);
  ctx.save();
  ctx.translate(x, y + (1 - p) * 20);
  ctx.scale(scale * (0.96 + p * 0.04), scale * (0.96 + p * 0.04));
  ctx.globalAlpha *= p;
  ctx.lineCap = "round";
  ctx.strokeStyle = accent;
  ctx.lineWidth = 4;
  ctx.beginPath();
  ctx.arc(0, -50, 166, -Math.PI / 3, -Math.PI / 3 + 1.84 * Math.PI * p);
  ctx.stroke();
  ctx.strokeStyle = `${accent}50`;
  ctx.lineWidth = 1;
  ctx.beginPath();
  ctx.arc(0, -50, 182, -Math.PI / 3, -Math.PI / 3 + 1.84 * Math.PI * p);
  ctx.stroke();
  ctx.fillStyle = accent;
  pulseHeights.forEach((height, index) => {
    const amount = ease(clamp(reveal * 1.5 - Math.abs(index - 2.5) * 0.12));
    ctx.beginPath();
    ctx.roundRect(
      -79 + index * 28,
      -50 - (height * amount) / 2,
      18,
      height * amount,
      9,
    );
    ctx.fill();
  });
  ctx.save();
  ctx.translate(99, -194);
  ctx.rotate(Math.PI / 4);
  ctx.fillRect(-8, -8, 16, 16);
  ctx.restore();
  ctx.textAlign = "center";
  ctx.save();
  ctx.beginPath();
  ctx.rect(-430 * p, 159, 860 * p, 188);
  ctx.clip();
  ctx.fillStyle = light;
  ctx.font = "600 38px Montserrat, Arial, sans-serif";
  ctx.fillText("SOUNDCLOUD", 0, 199);
  ctx.font = "800 104px Montserrat, Arial, sans-serif";
  ctx.fillText("FINDS", 0, 313);
  ctx.restore();
  ctx.fillStyle = `${light}99`;
  ctx.font = "500 14px Montserrat, Arial, sans-serif";
  ctx.fillText("GOOD MUSIC. FOUND HERE.", 0, 364);
  ctx.restore();
}
export function logoSvg(accent = "#ff7546") {
  const bars = pulseHeights
    .map(
      (height, index) =>
        `<rect x="${321 + index * 28}" y="${250 - height / 2}" width="18" height="${height}" rx="9"/>`,
    )
    .join("");
  return `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 800 740" role="img" aria-label="SoundCloud Finds"><title>SoundCloud Finds — discovery pulse logo</title><g fill="none" stroke="${accent}" stroke-width="4"><path d="M483 106 A166 166 0 1 1 423 86" stroke-linecap="round"/><circle cx="400" cy="250" r="182" stroke-opacity=".3" stroke-width="1"/></g><g fill="${accent}">${bars}<path d="M499 96l12 12-12 12-12-12z"/></g><g fill="white" text-anchor="middle" font-family="Montserrat,Arial,sans-serif"><text x="400" y="499" font-size="38" font-weight="600">SOUNDCLOUD</text><text x="400" y="613" font-size="104" font-weight="800">FINDS</text><text x="400" y="664" font-size="14" opacity=".6">GOOD MUSIC. FOUND HERE.</text></g></svg>`;
}
