import { lyricPresentation } from "./captions.mjs";

export function drawCaptions(ctx, cues, time, accent, band) {
  const presentation = lyricPresentation(cues, time);
  if (!presentation.visible || !band) return presentation;
  const words = presentation.words;
  let size = 40;
  const widthLimit = band.width - 8;
  const layout = () => {
    ctx.font = `700 ${size}px Montserrat, Arial, sans-serif`;
    const lines = [[]];
    for (const word of words) {
      const line = lines.at(-1);
      const candidate = [...line, word].map((item) => item.text).join(" ");
      if (line.length && ctx.measureText(candidate).width > widthLimit)
        lines.push([word]);
      else line.push(word);
    }
    return lines;
  };
  let lines = layout();
  while (
    (lines.length > 3 ||
      lines.length * (size + 14) > band.height ||
      lines.some(
        (line) =>
          ctx.measureText(line.map((word) => word.text).join(" ")).width >
          widthLimit,
      )) &&
    size > 20
  ) {
    size -= 2;
    lines = layout();
  }
  const lineHeight = size + 14;
  const top = band.y + 4;
  ctx.save();
  ctx.textBaseline = "middle";
  ctx.font = `700 ${size}px Montserrat, Arial, sans-serif`;
  const space = ctx.measureText(" ").width;
  lines.forEach((line, index) => {
    let x = band.x;
    const baseline = top + lineHeight * index + lineHeight / 2;
    for (const word of line) {
      const width = ctx.measureText(word.text).width;
      const isActive = time >= word.start && time < word.end;
      ctx.fillStyle = isActive
        ? accent
        : time >= word.end
          ? "#ffffff"
          : "#ffffffc4";
      ctx.fillText(word.text, x, baseline);
      if (isActive) {
        ctx.fillStyle = accent;
        ctx.fillRect(x, baseline + size * 0.42, width, 4);
      }
      x += width + space;
    }
  });
  ctx.restore();
  return presentation;
}
