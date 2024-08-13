const Product = require("../models/content.model");
var fs = require("fs");
const path = require("path");

const searchIdPromise = (id) => Product.find({ _id: id }).exec();
const generateUniqueName = (basePath, fileName) => {
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

exports.product_create = (req, res, next) => {
  //handle thumbnail image
  let name = generateUniqueName(thumbDir, req.files.img.name);
  req.files.img.mv(path.join(thumbDir, name), (err) => {
    if (err) return res.status(500).send("Thumbnail upload failed.");
  });

  //handle comicsArray or URL
  const detArray = [];
  const { title: t, subtitle: s } = req.body;
  const projName = t.replace(/[^\w]/gi, "") + s.replace(/[^\w]/gi, "");
  const isUpload = req.body.comicSource == "Upload";
  if (isUpload) {
    const dir = `/var/www/html/assets/comics/${projName}`;
    if (!fs.existsSync(dir)) fs.mkdirSync(dir);
    if (Array.isArray(req.files.pages)) {
      for (let i = 0; i < req.files.pages.length; i++) {
        req.files.pages[i].mv(dir + "/" + req.files.pages[i].name);
        detArray.push(req.files.pages[i].name);
      }
    } else {
      req.files.pages.mv(dir + "/" + req.files.pages.name);
      detArray.push(req.files.pages.name);
    }
  }
  const url = isUpload ? projName : req.body.url;
  let product = new Product({
    title: t,
    subtitle: s,
    img: name,
    url,
    category: req.body.category,
    date: Date(),
    series: req.body.series,
    comicsArray: detArray,
    updatedDate: Date(),
  });

  product.save((err) => {
    if (err) return next(err);
    res.send(posted);
  });
};

exports.post_update = (req, res, next) => {
  let name = "";
  //get info from old post
  let promise = searchIdPromise(req.body.contentUpdating);
  promise
    .then((oldContent) => {
      //handle thumbnail
      if (req.hasOwnProperty("files")) {
        name = generateUniqueName(thumbDir, req.files.img.name);
        req.files.img.mv(thumbDir + name);
      } else {
        name = oldContent.img;
      }
      //add new update for homepage
      let product = new Product({
        title: oldContent[0].title,
        subtitle: req.body.subtitle,
        img: name,
        url: oldContent[0].url,
        category: "update",
        date: Date(),
        series: oldContent[0].series,
        comicsArray: oldContent[0].comicsArray,
        updatedDate: Date(),
      });
      return {
        product: product,
        name: name,
        updating: req.body.contentUpdating,
      };
    })
    .then((deliverable) => {
      //update old project
      Product.findByIdAndUpdate(deliverable.updating, {
        $set: {
          updatedDate: Date(),
          img: deliverable.name,
        },
      }).exec();
      return deliverable.product;
    })
    .then((product) =>
      product.save((err) => {
        if (err) {
          return next(err);
        }
        res.send(posted);
      })
    );
};

exports.whole_list = (req, res, next) => {
  Product.find({})
    .sort("-date")
    .exec((err, personList) => {
      if (err) return next(err);
      if (isNaN(req.params.num)) {
        res.send(personList);
      } else {
        res.send(personList.slice(0, req.params.num));
      }
    });
};

exports.category_list = (req, res, next) => {
  Product.find({ category: req.params.cat })
    .sort("-updatedDate")
    .exec((err, personList) => {
      if (err) return next(err);
      res.send(personList);
    });
};

exports.comic_info = (req, res, next) => {
  Product.find({ _id: req.params.id }).exec((err, personList) => {
    if (err) return next(err);
    res.send(personList);
  });
};

exports.update_iframe = (req, res, next) => {
  Product.findByIdAndUpdate(
    req.params.id,
    { iframe: req.body.series },
    (err, product) => {
      if (err) return next(err);
      res.send(updated);
    }
  );
};

exports.update_series = (req, res, next) => {
  Product.findByIdAndUpdate(
    req.params.id,
    { series: req.body.series },
    (err, product) => {
      if (err) return next(err);
      res.send(updated);
    }
  );
};

exports.product_delete = (req, res, next) => {
  Product.findByIdAndRemove(req.params.id, (err) => {
    if (err) return next(err);
    res.send(deleted);
  });
};
