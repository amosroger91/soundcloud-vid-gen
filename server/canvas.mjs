import { GlobalFonts, createCanvas, loadImage } from "@napi-rs/canvas";
import path from "node:path";
import { root } from "./config.mjs";

// Static faces preserve weight selection in Skia; variable fonts otherwise render at their minimum weight.
for (const weight of ["Regular", "Medium", "SemiBold", "Bold", "ExtraBold"]) {
  GlobalFonts.registerFromPath(
    path.join(root, `assets/fonts/Montserrat-${weight}.ttf`),
    "Montserrat",
  );
}
export { createCanvas, loadImage };
