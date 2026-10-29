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

export const update_series = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await Product.findByIdAndUpdate(req.params.id, {
      series: req.body.series,
    }).exec();
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
