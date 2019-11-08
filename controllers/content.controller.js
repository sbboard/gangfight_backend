const Product = require('../models/content.model')
var fs = require('fs');

function retrieveUser(uname, callback) {
    Product.findById(uname, function(err, users) {
      if (err) {
        callback(err, null);
      } else {
        callback(null, users[0]);
      }
    })
}

exports.product_create = (req, res, next) => {
    //handle thumbnail image
    let name = req.files.img.name
    let detUrl = ""
    let detArray = []
    req.files.img.mv('/var/www/html/assets/contentImages/'+name)
    //handle comicsArray or URL
    if(req.body.comicSource == "Upload"){
        let projNameNoSpecial = req.body.title.replace(/\s/g, '') + req.body.subtitle.replace(/\s/g, '')
        let dir = `/var/www/html/assets/comics/${projNameNoSpecial}`
        detUrl = projNameNoSpecial
        if (!fs.existsSync(dir)){
            fs.mkdirSync(dir);
        }
        for(let i=0;i<req.files.pages.length;i++){
            req.files.pages[i].mv(dir+"/"+req.files.pages[i].name)
            detArray.push(req.files.pages[i].name)
        }
    }
    else{
        detUrl = req.body.url
    }
    let product = new Product({
        title: req.body.title,
        subtitle: req.body.subtitle,
        img: name,
        url: detUrl,
        category: req.body.category,
        date: Date(),
        series: req.body.series,
        comicsArray: detArray,
        updatedDate: Date(),
    })

    product.save((err) => {
        if (err){
            return next(err)
        }
        res.send('Content Posted')
    })
}

exports.post_update = (req, res, next) => {
    //get info from old post
    const contentUpdating = req.body.contentUpdating
    let name = ''
    Product
    .findOne({_id: contentUpdating})
    .exec()
    .then((result) => {
        return Product.findOne({}).exec()
    })
    .then((oldContent)=>{
        //handle thumbnail
        if(req.hasOwnProperty('files')){
            name = req.files.img.name
            req.files.img.mv('/var/www/html/assets/contentImages/'+name)
        }
        else{
            name = oldContent.img
        }
        //add new update for homepage
        let product = new Product({
            title: oldContent.title,
            subtitle: req.body.subtitle,
            img: name,
            url: oldContent.url,
            category: "update",
            date: Date(),
            series: oldContent.series,
            comicsArray: oldContent.comicsArray,
            updatedDate: Date(),
        })
        return {'product': product, 'name': name}
    })
    .then((deliverable)=>{
        //update old project
        Product
        .findByIdAndUpdate(contentUpdating, { $set: {
            updatedDate: Date(),
            img: deliverable.name
        }}).exec()
        return deliverable.product
    })
    .then((product)=>
    product.save((err) => {
        if (err){
            return next(err)
        }
        res.send('Update Posted')
    }))
}

exports.whole_list = (req, res, next) => {
    Product.find({}).sort('-date').exec((err,personList) => {
        if (err) return next(err)
        if(isNaN(req.params.num)){
            res.send(personList)
        }
        else{
            res.send(personList.slice(0,req.params.num))
        }
    })
}

exports.category_list = (req, res, next) => {
    Product.find({category:req.params.cat}).sort('-updatedDate').exec((err,personList) => {
        if (err) return next(err)
        res.send(personList)
    })
}

exports.comic_info = (req, res, next) => {
    Product.find({_id:req.params.id}).exec((err,personList) => {
        if (err) return next(err)
        res.send(personList)
    })
}

exports.product_update = (req, res, next) => {
    Product.findByIdAndUpdate(req.params.id, { $set: req.body},
        (err, product) => {
        if (err) return next(err)
        res.send("Content updated")
    })
}

exports.product_delete = (req, res, next) => {
    Product.findByIdAndRemove(req.params.id, (err) => {
        if (err) return next(err)
        res.send('Deleted successfully')
    })
}