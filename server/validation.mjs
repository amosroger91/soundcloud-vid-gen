import { z } from "zod";

const soundcloudHosts = new Set([
  "soundcloud.com",
  "www.soundcloud.com",
  "m.soundcloud.com",
]);
const shortHosts = new Set(["on.soundcloud.com", "soundcloud.app.goo.gl"]);
export function validateSource(value, allowShort = true) {
  let url;
  try {
    url = new URL(value);
  } catch {
    throw new Error("Paste a valid SoundCloud song URL.");
  }
  if (url.protocol !== "https:" || url.port || url.username || url.password)
    throw new Error("Use an HTTPS SoundCloud song URL.");
  if (allowShort && shortHosts.has(url.hostname) && url.pathname.length > 1)
    return url;
  if (!soundcloudHosts.has(url.hostname))
    throw new Error("Only SoundCloud song links are supported.");
  const parts = url.pathname.split("/").filter(Boolean);
  if (
    parts.length !== 2 ||
    ["sets", "tracks", "albums", "likes", "reposts"].includes(parts[1]) ||
    ["discover", "search", "you", "charts"].includes(parts[0])
  ) {
    throw new Error("Choose one song, rather than a profile or playlist.");
  }
  url.hostname = "soundcloud.com";
  url.search = "";
  url.hash = "";
  return url;
}

export async function resolveSource(value, signal) {
  let url = validateSource(value);
  for (let i = 0; i < 6 && shortHosts.has(url.hostname); i++) {
    const response = await fetch(url, {
      redirect: "manual",
      signal: AbortSignal.any([signal, AbortSignal.timeout(15000)]),
    });
    const location = response.headers.get("location");
    await response.body?.cancel();
    if (!location || response.status < 300 || response.status >= 400)
      throw new Error(
        "This share link could not be resolved. Paste the full soundcloud.com/artist/song URL.",
      );
    url = validateSource(new URL(location, url).href);
  }
  return validateSource(url.href, false).href;
}

export const uuidSchema = z.string().uuid();
export const importSchema = z.object({
  url: z
    .string()
    .max(2048)
    .transform((url, ctx) => {
      try {
        return validateSource(url).href;
      } catch (error) {
        ctx.addIssue({ code: "custom", message: error.message });
        return z.NEVER;
      }
    }),
});
export const clipSchema = z.object({
  trackId: uuidSchema,
  start: z.number().finite().min(0),
  duration: z.number().finite().min(3).max(60),
});
const wordSchema = z
  .object({
    start: z.number().finite().min(0).max(60),
    end: z.number().finite().min(0).max(60),
    text: z.string().trim().min(1).max(120),
  })
  .refine((word) => word.end > word.start, "Word end must follow its start.");
export const captionSchema = z
  .object({
    start: z.number().finite().min(0).max(60),
    end: z.number().finite().min(0).max(60),
    text: z.string().trim().min(1).max(120),
    words: z.array(wordSchema).max(30).optional(),
  })
  .refine(
    (cue) =>
      cue.end > cue.start &&
      (!cue.words ||
        cue.words.every(
          (word) =>
            word.start >= cue.start - 0.01 && word.end <= cue.end + 0.01,
        )),
    "Caption timing is invalid.",
  );
export const renderSchema = clipSchema
  .extend({
    theme: z.enum(["ember", "ice", "violet"]).default("ember"),
    episode: z
      .string()
      .regex(/^\d{1,3}$/)
      .default("001"),
    branded: z.boolean().default(true),
    captions: z.array(captionSchema).max(200).default([]),
  })
  .refine(
    (options) =>
      options.captions.every(
        (cue, i, all) =>
          cue.end <= options.duration + 0.01 &&
          (i === 0 || cue.start >= all[i - 1].end - 0.01),
      ),
    "Captions must be ordered, non-overlapping, and within the clip.",
  );
export const transcribeSchema = clipSchema.extend({
  language: z
    .enum([
      "auto",
      "english",
      "spanish",
      "french",
      "german",
      "portuguese",
      "italian",
      "japanese",
      "korean",
    ])
    .default("auto"),
});

export function validateClip(options, track) {
  if (options.start + options.duration > track.duration + 0.02)
    throw new Error("The clip extends beyond the end of the song.");
}
