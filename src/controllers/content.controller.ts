import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import Product from "../models/content.model.js";
import { UploadedFile } from "express-fileupload";

const thumbDir = "/var/www/html/assets/contentImages/";
const comicsDir = "/var/www/html/assets/comics/";
const CTA = `<a href='/gf_gambee'>let's go home</a>`;
const posted = `Posted!<br/>${CTA}`;
const deleted = `Deleted!<br/>${CTA}`;
const updated = `Updated!<br/>${CTA}`;

// strips any directory parts a client might sneak into an upload's name
const safeName = (fileName: string) => path.basename(fileName);

const generateUniqueName = (basePath: string, fileName: string): string => {
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

    const imgFile = req.files.img as UploadedFile;
    const name = generateUniqueName(thumbDir, imgFile.name);
    await imgFile.mv(path.join(thumbDir, name));

    const detArray: string[] = [];
    const {
      title: t = "",
      subtitle: s = "",
      comicSource,
      url,
      category,
      series,
      author,
      artist,
    } = req.body;
    const projName = t.replace(/[^\w]/gi, "") + s.replace(/[^\w]/gi, "");
    const isUpload = comicSource === "Upload";

    if (isUpload) {
      const dir = path.join(comicsDir, projName);
      fs.mkdirSync(dir, { recursive: true });

      for (const file of asFileList(req.files.pages)) {
        const pageName = safeName(file.name);
        await file.mv(path.join(dir, pageName));
        detArray.push(pageName);
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
      author: optionalText(author),
      artist: optionalText(artist),
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
      name = generateUniqueName(thumbDir, imgFile.name);
      await imgFile.mv(path.join(thumbDir, name));
    }

    const product = new Product({
      title: oldContent.title,
      subtitle: req.body.subtitle,
      img: name,
      url: oldContent.url,
      category: "update",
      date: new Date(),
      series: oldContent.series,
      author: oldContent.author,
      artist: oldContent.artist,
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

// sets a comic's author/artist; a blank value clears it
export const update_credits = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const $set: Record<string, string> = {};
    const $unset: Record<string, ""> = {};
    for (const field of ["author", "artist"] as const) {
      if (!(field in req.body)) continue;
      const value = optionalText(req.body[field]);
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
