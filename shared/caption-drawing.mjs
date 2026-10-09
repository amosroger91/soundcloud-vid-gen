import { cueAt, cueWords } from "./captions.mjs";
import { ease } from "./timeline.mjs";

export function drawCaptions(ctx, cues, time, accent) {
  const cue = cueAt(cues, time);
  if (!cue) return;
  const words = cueWords(cue);
  let size = 44;
  const layout = () => {
    ctx.font = `800 ${size}px Montserrat, Arial, sans-serif`;
    const lines = [[]];
    for (const word of words) {
      const line = lines.at(-1);
      const candidate = [...line, word].map((word) => word.text).join(" ");
      if (line.length && ctx.measureText(candidate).width > 646)
        lines.push([word]);
      else line.push(word);
    }
    return lines;
  };
  let lines = layout();
  while (
    (lines.length > 3 ||
      lines.some(
        (line) =>
          ctx.measureText(line.map((word) => word.text).join(" ")).width > 646,
      )) &&
    size > 18
  ) {
    size -= 2;
    lines = layout();
  }
  const entrance = ease((time - cue.start) / 0.15);
  const exit = ease((cue.end - time) / 0.16);
  ctx.save();
  ctx.globalAlpha *= Math.min(entrance, exit);
  const height = lines.length * (size + 13) + 38;
  const y = 983 - height / 2 + (1 - entrance) * 10;
  ctx.shadowColor = "#00000099";
  ctx.shadowBlur = 22;
  ctx.fillStyle = "#080b12ed";
  ctx.beginPath();
  ctx.roundRect(110, y, 720, height, 17);
  ctx.fill();
  ctx.shadowBlur = 0;
  ctx.fillStyle = accent;
  ctx.fillRect(110, y + 17, 3, height - 34);
  ctx.textBaseline = "middle";
  ctx.font = `800 ${size}px Montserrat, Arial, sans-serif`;
  const space = ctx.measureText(" ").width;
  lines.forEach((line, index) => {
    const lineWidth = ctx.measureText(
      line.map((word) => word.text).join(" "),
    ).width;
    let x = 470 - lineWidth / 2;
    for (const word of line) {
      const width = ctx.measureText(word.text).width;
      const baseline = y + 22 + (size + 13) * index + size / 2;
      const isActive = time >= word.start && time < word.end;
      if (isActive) {
        ctx.fillStyle = accent;
        ctx.beginPath();
        ctx.roundRect(x - 7, baseline - size / 2 - 5, width + 14, size + 11, 7);
        ctx.fill();
      }
      ctx.fillStyle = isActive
        ? "#0b1018"
        : time >= word.end
          ? "#ffffff"
          : "#ffffffb8";
      ctx.fillText(word.text, x, baseline);
      x += width + space;
    }
  });
  ctx.restore();
}
