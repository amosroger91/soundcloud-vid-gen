import { randomUUID } from 'node:crypto';
import { copyFile, mkdir, writeFile } from 'node:fs/promises';
import path from 'node:path';
import { createCanvas, loadImage } from '../server/canvas.mjs';
import { createDemo } from '../server/media.mjs';
import { dataDir, root } from '../server/config.mjs';
import { readJson } from '../server/storage.mjs';
import { drawFrame } from '../shared/composition.mjs';
import { createDirection } from '../shared/direction.mjs';
import { renderVideo } from '../server/render.mjs';

const directory = path.join(root, 'test-results');
await mkdir(directory, { recursive: true });
const track = await createDemo(randomUUID(), () => {}, new AbortController().signal);
const analysis = await readJson(path.join(dataDir, 'tracks', track.id, 'analysis.json'));
const art = await loadImage(path.join(dataDir, 'tracks', track.id, 'artwork.jpg'));
const options = { track, analysis, art, duration: 18, start: 4, episode: '001', branded: false };
const plan = createDirection(options);
const sheet = createCanvas(1080, 1360);
const ctx = sheet.getContext('2d');
ctx.fillStyle = '#090b13';
ctx.fillRect(0, 0, 1080, 1360);
const kinds = ['sleeve', 'orbit', 'panorama'];
const themes = ['ember', 'ice', 'violet'];
for (let column = 0; column < kinds.length; column++) {
  // Find a genuine directed shot of each kind, including remixes if necessary.
  let variation = 0, shot = plan.shots.find((shot) => shot.kind === kinds[column]);
  while (!shot && variation < 100) {
    variation++;
    shot = createDirection({ ...options, variation }).shots.find((shot) => shot.kind === kinds[column]);
  }
  if (!shot) throw new Error(`No ${kinds[column]} shot found.`);
  const time = shot.start + (shot.end - shot.start) * 0.55;
  for (let row = 0; row < 2; row++) {
    const canvas = createCanvas(1080, 1920);
    const captions = row ? [{ start: Math.max(0, time - 1), end: time + 1, text: 'A little more listening' }] : [];
    drawFrame(canvas.getContext('2d'), { ...options, variation, theme: themes[column], time, captions });
    await writeFile(path.join(directory, `motion-${kinds[column]}${row ? '-lyrics' : ''}.png`), await canvas.encode('png'));
    ctx.drawImage(canvas, column * 360, row * 680 + 30, 360, 640);
    ctx.fillStyle = '#fff';
    ctx.font = '500 13px Montserrat';
    ctx.fillText(`${kinds[column].toUpperCase()} / ${row ? 'LYRICS' : 'INSTRUMENTAL'}`, column * 360 + 36, row * 680 + 24);
  }
}
const sheetFile = path.join(directory, 'motion-contact-sheet.jpg');
await writeFile(sheetFile, await sheet.encode('jpeg', 92));
console.log(`Contact sheet: ${sheetFile}`);
if (process.argv.includes('--render')) {
  const id = randomUUID();
  const { duration, start, episode, branded } = options;
  await renderVideo(id, { trackId: track.id, duration, start, episode, branded },
    (progress, message) => console.log(`${progress}% ${message}`), new AbortController().signal);
  const video = path.join(directory, 'motion-showcase.mp4');
  await copyFile(path.join(dataDir, 'renders', id, 'soundcloud-finds.mp4'), video);
  console.log(`Video: ${video}`);
}
