// One-off: converts the PNG covers and comic pages already on the server to
// lossless WebP, the way new uploads are now saved (see utils/webp.ts), and
// points the content documents at the new files.
//
//   node dist/scripts/convertToWebp.js           dry run - reports only
//   node dist/scripts/convertToWebp.js --apply   writes files + updates db
//
// The PNGs are left where they are, so nothing is lost and links to them
// keep working; delete them by hand once the site looks right. Safe to run
// again: documents already pointing at WebP files are skipped.
import fs from "fs";
import path from "path";
import mongoose from "mongoose";
import { MONGO_URI } from "../env.js";
import Product from "../models/content.model.js";
import { comicsDir, thumbDir } from "../constants/paths.js";
import { generateUniqueName } from "../controllers/content.controller.js";
import { isPng, pngToWebp, webpName } from "../utils/webp.js";

const apply = process.argv.includes("--apply");

let before = 0;
let after = 0;
let converted = 0;
let missing = 0;

// file path -> its new name, or null if it stays as it is. Documents share
// files ("update" posts reuse their comic's cover and pages), so each file
// is only looked at once.
const done = new Map<string, string | null>();

async function convert(dir: string, name: string): Promise<string | null> {
  const file = path.join(dir, name);
  if (done.has(file)) return done.get(file)!;
  let result: string | null = null;
  if (!fs.existsSync(file)) {
    console.warn(`missing: ${file}`);
    missing++;
  } else {
    const png = await fs.promises.readFile(file);
    const webp = await pngToWebp(png);
    if (webp) {
      result = generateUniqueName(dir, webpName(name));
      before += png.length;
      after += webp.length;
      converted++;
      if (apply) await fs.promises.writeFile(path.join(dir, result), webp);
    }
  }
  done.set(file, result);
  return result;
}

async function main() {
  await mongoose.connect(MONGO_URI);
  const docs = await Product.find({}).exec();
  let updatedDocs = 0;

  for (const doc of docs) {
    const $set: Record<string, unknown> = {};

    if (doc.img && isPng(doc.img)) {
      const img = await convert(thumbDir, doc.img);
      if (img) $set.img = img;
    }

    // uploaded comics keep their pages in comicsDir/<url>/
    const pages = doc.comicsArray ?? [];
    const pageDir = path.join(comicsDir, path.basename(doc.url ?? ""));
    if (pages.some((p) => typeof p === "string" && isPng(p))) {
      let changed = false;
      const next = [];
      for (const page of pages) {
        const webp =
          typeof page === "string" && isPng(page)
            ? await convert(pageDir, page)
            : null;
        if (webp) changed = true;
        next.push(webp ?? page);
      }
      if (changed) $set.comicsArray = next;
    }

    if (Object.keys($set).length) {
      updatedDocs++;
      if (apply) await Product.updateOne({ _id: doc._id }, { $set }).exec();
    }
  }

  const mb = (bytes: number) => (bytes / 1048576).toFixed(1) + "MB";
  console.log(
    `${apply ? "Converted" : "Would convert"} ${converted} PNGs: ` +
      `${mb(before)} -> ${mb(after)}, ` +
      `${apply ? "updated" : "would update"} ${updatedDocs} documents` +
      (missing ? ` (${missing} files missing, left as-is)` : "")
  );
  if (!apply) console.log("Dry run - pass --apply to write.");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
