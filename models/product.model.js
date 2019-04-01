const mongoose = require('mongoose')
mongoose.set('useFindAndModify', false)
const Schema = mongoose.Schema

const ProductSchema = new Schema({
    name: {type: String, required: true, max: 100},
    age: {type: Number, required: true},
    cat: {type: String, required: true, max: 100},
    shoe: {type: String, required: true, max: 100},
})

module.exports = mongoose.model('Product', ProductSchema)