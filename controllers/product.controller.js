const Product = require('../models/content.model')

exports.person_info = (req, res, next) => {
    Product.findById(req.params.id, (err, personInfo) => {
        if (err) return next(err)
        res.send(personInfo)
    })
}

exports.whole_list = (req, res, next) => {
    Product.find({}, (err, personList) => {
        if (err) return next(err)
        res.send(personList)
    })
}

exports.person_list = (req, res, next) => {
    Product.find({}, (err, personList) => {
        if (err) return next(err)
        let list = []
        personList.forEach((user)=> {
            list.push([user.name, user.id])
        })
        res.send(list)
    })
}

exports.cat_list = (req, res, next) => {
    Product.find({}, (err, personList) => {
        if (err) return next(err)
        let list = []
        personList.forEach((user)=> {
            list.push([user.cat, user.id])
        })
        res.send(list)
    })
}

exports.product_create = (req, res, next) => {
    let product = new Product({
        name: req.body.name,
        age: req.body.age,
        cat: req.body.cat,
        shoe: req.body.shoe
    })

    product.save((err) => {
        if (err){
            return next(err)
        }
        res.send('Person created!')
    })
}

exports.product_update = (req, res, next) => {
    Product.findByIdAndUpdate(req.params.id, { $set: req.body},
        (err, product) => {
        if (err) return next(err)
        res.send("Person updated")
    })
}

exports.product_delete = (req, res, next) => {
    Product.findByIdAndRemove(req.params.id, (err) => {
        if (err) return next(err)
        res.send('Deleted successfully')
    })
}