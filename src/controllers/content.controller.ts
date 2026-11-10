import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import Product from "../models/content.model.js";
import { UploadedFile } from "express-fileupload";
import { saveImage } from "../utils/webp.js";
import { comicsDir, thumbDir } from "../constants/paths.js";
const CTA = `<a href='/gf_gambee'>let's go home</a>`;
const posted = `Posted!<br/>${CTA}`;
const deleted = `Deleted!<br/>${CTA}`;
const updated = `Updated!<br/>${CTA}`;

// strips any directory parts a client might sneak into an upload's name
const safeName = (fileName: string) => path.basename(fileName);

export const generateUniqueName = (
  basePath: string,
  fileName: string
): string => {
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);
  let uniqueName = safeName(fileName);
  let counter = 1;

  while (fs.existsSync(path.join(basePath, uniqueName))) {
    uniqueName = `${baseName}_${counter}${ext}`;
    counter++;
  }

  return uniqueName;
};

const asFileList = (files?: UploadedFile | UploadedFile[]): UploadedFile[] =>
  !files ? [] : Array.isArray(files) ? files : [files];

// optional text fields: blank form inputs are stored as nothing at all
const optionalText = (value: unknown) =>
  typeof value === "string" && value.trim() ? value.trim() : undefined;

const CREDIT_FIELDS = [
  "author",
  "artist",
  "musician",
  "authorUrl",
  "artistUrl",
  "musicianUrl",
] as const;
type Credits = Partial<Record<(typeof CREDIT_FIELDS)[number], string>>;
const BAD_LINK = "Credit links must start with http:// or https://";

const isWebLink = (text: string) => {
  try {
    return ["http:", "https:"].includes(new URL(text).protocol);
  } catch {
    return false;
  }
};

// the credit fields present in a form body (blank means clear it), or null if
// a link isn't http(s) - the site puts these straight into an href
const readCredits = (body: Record<string, unknown>): Credits | null => {
  const credits: Credits = {};
  for (const field of CREDIT_FIELDS) {
    if (!(field in body)) continue;
    const value = optionalText(body[field]);
    if (value && field.endsWith("Url") && !isWebLink(value)) return null;
    credits[field] = value;
  }
  return credits;
};

// ---- series reading order -------------------------------------------------
//
// A comic in a series has a seriesOrder: its place in the order the series
// is meant to be read (0 first), which isn't always the order they came
// out in. Only comics in a series have one - "noseries" (or none) means no
// reading order. It's only ever set here and by series_order; neither
// touches a comic's date or updatedDate.

const NO_SERIES = "noseries";
const inASeries = (series: unknown): series is string =>
  typeof series === "string" && series.trim() !== "" && series !== NO_SERIES;

// The next place at the end of a series' reading order. Comics from before
// reading orders existed have none, so the series is first numbered 0, 1,
// 2... in its current order - any it already has first, then the rest in
// release order - so a comic added "at the end" really is after all of them.
const endOfSeries = async (series: string): Promise<number> => {
  const comics = await Product.find({ category: "comic", series })
    .select("seriesOrder date")
    .exec();
  const ordered = [...comics].sort((a, b) => {
    const ao = a.seriesOrder ?? Infinity;
    const bo = b.seriesOrder ?? Infinity;
    if (ao !== bo) return ao - bo;
    return new Date(a.date).getTime() - new Date(b.date).getTime();
  });
  const renumber = ordered.flatMap((comic, seriesOrder) =>
    comic.seriesOrder === seriesOrder
      ? []
      : [
          {
            updateOne: {
              filter: { _id: comic._id },
              update: { $set: { seriesOrder } },
            },
          },
        ]
  );
  if (renumber.length) await Product.bulkWrite(renumber);
  return ordered.length;
};

export const product_create = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    if (!req.files || !req.files.img) {
      res.status(400).send("No image uploaded.");
      return;
    }

    const credits = readCredits(req.body);
    if (!credits) {
      res.status(400).send(BAD_LINK);
      return;
    }

    const imgFile = req.files.img as UploadedFile;
    const name = await saveImage(imgFile.data, thumbDir, imgFile.name, (n) =>
      generateUniqueName(thumbDir, n)
    );

    const detArray: string[] = [];
    const {
      title: t = "",
      subtitle: s = "",
      comicSource,
      url,
      category,
      series,
    } = req.body;
    const projName = t.replace(/[^\w]/gi, "") + s.replace(/[^\w]/gi, "");
    const isUpload = comicSource === "Upload";

    if (isUpload) {
      const dir = path.join(comicsDir, projName);
      fs.mkdirSync(dir, { recursive: true });

      // PNG pages are stored as WebP (see utils/webp.ts)
      for (const file of asFileList(req.files.pages)) {
        detArray.push(await saveImage(file.data, dir, safeName(file.name)));
      }
    }

    const product = new Product({
      title: t,
      subtitle: s,
      img: name,
      url: isUpload ? projName : url,
      category,
      date: new Date(),
      series,
      // a new comic in a series goes at the end of its reading order
      ...(category === "comic" && inASeries(series)
        ? { seriesOrder: await endOfSeries(series) }
        : {}),
      ...credits,
      comicsArray: detArray,
      updatedDate: new Date(),
    });

    await product.save();
    res.send("Product created successfully");
  } catch (err) {
    next(err);
  }
};

export const post_update = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const oldContent = await Product.findById(req.body.contentUpdating).exec();
    if (!oldContent) {
      res.status(404).send("Content to update not found.");
      return;
    }

    let name = oldContent.img;
    if (req.files && req.files.img) {
      const imgFile = req.files.img as UploadedFile;
      name = await saveImage(imgFile.data, thumbDir, imgFile.name, (n) =>
        generateUniqueName(thumbDir, n)
      );
    }

    const product = new Product({
      title: oldContent.title,
      subtitle: req.body.subtitle,
      img: name,
      url: oldContent.url,
      category: "update",
      date: new Date(),
      series: oldContent.series,
      ...Object.fromEntries(
        CREDIT_FIELDS.map((field) => [field, oldContent[field]])
      ),
      comicsArray: oldContent.comicsArray,
      updatedDate: new Date(),
    });

    await Product.findByIdAndUpdate(oldContent._id, {
      $set: { updatedDate: new Date(), img: name },
    }).exec();

    await product.save();
    res.send(posted);
  } catch (err) {
    next(err);
  }
};

export const whole_list = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const limit = Number(req.params.num);
    const query = Product.find({}).sort("-date");
    if (Number.isInteger(limit) && limit > 0) query.limit(limit);
    res.send(await query.exec());
  } catch (err) {
    next(err);
  }
};

export const category_list = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const personList = await Product.find({ category: req.params.cat })
      .sort("-updatedDate")
      .exec();
    res.send(personList);
  } catch (err) {
    next(err);
  }
};

export const comic_info = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const personList = await Product.find({ _id: req.params.id }).exec();
    res.send(personList);
  } catch (err) {
    next(err);
  }
};

export const update_iframe = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const updatedProduct = await Product.findByIdAndUpdate(
      req.params.id,
      { iframe: req.body.iframe },
      { new: true }
    ).exec();
    res.send(updatedProduct);
  } catch (err) {
    next(err);
  }
};

// Moves a comic to another series - onto the end of that series' reading
// order - or out of any (which clears its place in one). Its dates stay.
export const update_series = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { series } = req.body;
    const comic = await Product.findById(req.params.id).exec();
    if (!comic) {
      res.status(404).send("Comic not found.");
      return;
    }
    if (comic.series === series) {
      res.send(updated);
      return;
    }
    const update = inASeries(series)
      ? { $set: { series, seriesOrder: await endOfSeries(series) } }
      : { $set: { series }, $unset: { seriesOrder: "" } };
    await Product.findByIdAndUpdate(comic._id, update).exec();
    res.send(updated);
  } catch (err) {
    next(err);
  }
};

// Sets a series' whole reading order at once, from gambee's Series Order
// page. body: { series, order: [comic ids, first to read to last] }. Every
// comic in the series has to be listed, once, and nothing else - so a stale
// page (a comic added or moved since it loaded) is turned away rather than
// leaving gaps. Only seriesOrder changes - never a date.
export const series_order = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const { series, order } = req.body ?? {};
    if (!inASeries(series)) {
      res.status(400).send("Only a series has a reading order.");
      return;
    }
    if (
      !Array.isArray(order) ||
      !order.every((id) => typeof id === "string") ||
      new Set(order).size !== order.length
    ) {
      res.status(400).send("order must be a list of comic ids, each once.");
      return;
    }
    const inSeries = await Product.find({ category: "comic", series })
      .select("_id")
      .exec();
    const ids = new Set(inSeries.map((c) => String(c._id)));
    if (order.length !== ids.size || !order.every((id) => ids.has(id))) {
      res
        .status(409)
        .send(
          `That isn't every comic in ${series} - reload the page and try again.`
        );
      return;
    }
    await Product.bulkWrite(
      order.map((id: string, seriesOrder: number) => ({
        updateOne: { filter: { _id: id }, update: { $set: { seriesOrder } } },
      }))
    );
    res.send(updated);
  } catch (err) {
    next(err);
  }
};

// sets any of a comic's credits and their links; a blank value clears it
export const update_credits = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const credits = readCredits(req.body);
    if (!credits) {
      res.status(400).send(BAD_LINK);
      return;
    }

    const $set: Record<string, string> = {};
    const $unset: Record<string, ""> = {};
    for (const field of CREDIT_FIELDS) {
      if (!(field in credits)) continue;
      const value = credits[field];
      if (value) $set[field] = value;
      else $unset[field] = "";
    }
    await Product.findByIdAndUpdate(req.params.id, { $set, $unset }).exec();
    res.send(updated);
  } catch (err) {
    next(err);
  }
};

export const product_delete = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await Product.findByIdAndDelete(req.params.id).exec();
    res.send(deleted);
  } catch (err) {
    next(err);
  }
};
