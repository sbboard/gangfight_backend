import { Request, Response, NextFunction } from "express";
import fs from "fs";
import path from "path";
import Product from "../models/content.model.js";
import { UploadedFile } from "express-fileupload";

const searchIdPromise = (id: string) => Product.find({ _id: id }).exec();

const generateUniqueName = (basePath: string, fileName: string): string => {
  const ext = path.extname(fileName);
  const baseName = path.basename(fileName, ext);
  let uniqueName = fileName;
  let counter = 1;

  while (fs.existsSync(basePath + uniqueName)) {
    uniqueName = `${baseName}_${counter}${ext}`;
    counter++;
  }

  return uniqueName;
};

const thumbDir = "/var/www/html/assets/contentImages/";
const CTA = `<a href='/gf_gambee'>let's go home</a>`;
const posted = `Posted!<br/>${CTA}`;
const deleted = `Deleted!<br/>${CTA}`;
const updated = `Updated!<br/>${CTA}`;

export const product_create = (
  req: Request,
  res: Response,
  next: NextFunction
): void => {
  if (!req.files || !req.files.img) {
    res.status(400).send("No image uploaded.");
    return;
  }

  const imgFile = req.files.img as UploadedFile;
  const name = generateUniqueName(thumbDir, imgFile.name);

  imgFile.mv(path.join(thumbDir, name), (err) => {
    if (err) return res.status(500).send("Thumbnail upload failed.");
  });

  const detArray: string[] = [];
  const {
    title: t,
    subtitle: s,
    comicSource,
    url,
    category,
    series,
  } = req.body;
  const projName = t.replace(/[^\w]/gi, "") + s.replace(/[^\w]/gi, "");
  const isUpload = comicSource === "Upload";

  if (isUpload) {
    const dir = `/var/www/html/assets/comics/${projName}`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);

    if (Array.isArray(req.files.pages)) {
      req.files.pages.forEach((file: UploadedFile) => {
        file.mv(`${dir}/${file.name}`);
        detArray.push(file.name);
      });
    } else {
      const file = req.files.pages as UploadedFile;
      file.mv(`${dir}/${file.name}`);
      detArray.push(file.name);
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
    comicsArray: detArray,
    updatedDate: new Date(),
  });

  product.save((err) => {
    if (err) return next(err);
    res.send(posted);
  });
};

export const post_update = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    let name = "";
    const oldContent = await searchIdPromise(req.body.contentUpdating);

    if (req.files && req.files.img) {
      const imgFile = req.files.img as UploadedFile;
      name = generateUniqueName(thumbDir, imgFile.name);
      imgFile.mv(thumbDir + name);
    } else {
      name = oldContent[0]?.img;
    }

    const product = new Product({
      title: oldContent[0]?.title,
      subtitle: req.body.subtitle,
      img: name,
      url: oldContent[0]?.url,
      category: "update",
      date: new Date(),
      series: oldContent[0]?.series,
      comicsArray: oldContent[0]?.comicsArray,
      updatedDate: new Date(),
    });

    await Product.findByIdAndUpdate(req.body.contentUpdating, {
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
    const personList = await Product.find({}).sort("-date").exec();
    res.send(
      isNaN(Number(req.params.num))
        ? personList
        : personList.slice(0, Number(req.params.num))
    );
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

export const product_delete = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    await Product.findByIdAndRemove(req.params.id).exec();
    res.send(deleted);
  } catch (err) {
    next(err);
  }
};
