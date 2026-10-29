import fs from "fs";
import path from "path";
import sharp from "sharp";

// PNGs are re-encoded as lossless WebP - identical pixels, usually a good
// deal smaller for comic art. Kept as PNG unless WebP saves at least 10%.
// Other formats (JPEG, GIF) are left alone: re-encoding them loses quality.
const MAX_RATIO = 0.9;

export const isPng = (fileName: string) => /\.png$/i.test(fileName);

export const webpName = (fileName: string) =>
  path.basename(fileName, path.extname(fileName)) + ".webp";

// the WebP version of a PNG, or null when it isn't worth switching
export async function pngToWebp(png: Buffer): Promise<Buffer | null> {
  const webp = await sharp(png).webp({ lossless: true, effort: 6 }).toBuffer();
  return webp.length <= png.length * MAX_RATIO ? webp : null;
}

// Writes an uploaded image into dir, as WebP (with a .webp extension) when
// it's a PNG that shrinks. `nameFor` turns that file name into the one saved
// - e.g. to make it unique in dir - and the saved name is returned, which is
// what gets stored.
export async function saveImage(
  data: Buffer,
  dir: string,
  fileName: string,
  nameFor: (fileName: string) => string = (name) => name
): Promise<string> {
  const webp = isPng(fileName) ? await pngToWebp(data) : null;
  const saved = nameFor(webp ? webpName(fileName) : fileName);
  await fs.promises.writeFile(path.join(dir, saved), webp ?? data);
  return saved;
}
