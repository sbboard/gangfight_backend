const mongoose = require('mongoose')
mongoose.set('useFindAndModify', false)
const Schema = mongoose.Schema

const GangContent = new Schema({
    title: {type: String, required: true},
    subtitle: {type: String},
    img: {type: String, required: true},
    url: {type: String, required: true},
    category: {type: String},
    date: {type: Date, required: true},
    updatedDate: {type: Date},
    series: {type: String},
    assetFolder: {type: String},
    comicsArray: {type: Array},
})

module.exports = mongoose.model('content', GangContent)