import { loadTranscriber, modelName } from "../server/transcribe.mjs";
console.log(
  `Preparing ${modelName}. The first run downloads model weights; audio stays on this machine.`,
);
const engine = await loadTranscriber((_progress, message) =>
  console.log(message),
);
await engine.dispose();
console.log("Local speech-to-text is ready.");
