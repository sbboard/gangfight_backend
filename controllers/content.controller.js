const Product = require('../models/content.model')

exports.product_create = (req, res, next) => {
    let product = new Product({
        title: req.body.title,
        subtitle: req.body.subtitle,
        img: req.body.img,
        url: req.body.url,
        category: req.body.category,
        date: Date(),
        series: req.body.series
    })

    product.save((err) => {
        if (err){
            return next(err)
        }
        res.send('Content Posted')
    })
}

exports.person_info = (req, res, next) => {
    Product.findById(req.params.id, (err, personInfo) => {
        if (err) return next(err)
        res.send(personInfo)
    })
}

exports.whole_list = (req, res, next) => {
    if(isNaN(req.params.num)){
        Product.find({}, (err, personList) => {
            if (err) return next(err)
            res.send(personList)
        })
    }
    else{
        Product.find({}, (err, personList) => {
            if (err) return next(err)
            let list = []
            for(let i = 0;i<req.params.num;i++){
                if(personList[i]!=null){
                    list.push(personList[i])
                }
            }
            res.send(list)
        })
    }
}

exports.comic_list = (req, res, next) => {
    Product.find({}, (err, personList) => {
        if (err) return next(err)
        let list = []
        personList.forEach((user)=> {
            if(user.category == "comic"){
                list.push([user.title, user.id])
            }
        })
        res.send(list)
    })
}

exports.proj_list = (req, res, next) => {
    Product.find({}, (err, personList) => {
        if (err) return next(err)
        let list = []
        personList.forEach((user)=> {
            if(user.category == "project"){
                list.push([user.title, user.id])
            }
        })
        res.send(list)
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