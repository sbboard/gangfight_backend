const Product = require('../models/content.model')

exports.product_create = (req, res, next) => {
    let name = req.files.img.name
    let detUrl = ""
    let detArray = []
    req.files.img.mv('/var/www/html/assets/contentImages/'+name)
    if(req.body.comicSource == "Upload"){
        let projNameNoSpecial = req.body.title.replace(/\s/g, '') + req.body.subtitle.replace(/\s/g, '')
        detUrl = projNameNoSpecial
        //create assetFolder if needed using projNameNoSpecial
        //move files to assetFolder
    }
    else{
        detUrl = req.body.url
        //set a blank comicsarray
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
    })

    product.save((err) => {
        if (err){
            return next(err)
        }
        res.send('Content Posted')
    })
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
    Product.find({category:req.params.cat}).sort('-date').exec((err,personList) => {
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