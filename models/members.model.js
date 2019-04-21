const mongoose = require('mongoose')
mongoose.set('useFindAndModify', false)
const Schema = mongoose.Schema

const members = new Schema({
    username: {type: String, required: true},
    password: {type: String, required: true},
    email: {type: String, required: true},
    dateRegistered: {type: Date, required: true},
    lastLogin: {type: Date, required: true},
    banStatus: {type: Boolean, required: true},
    inventory: {type: Array},
    badges: {type: Array},
    profilePic: {type: Array, required: true},
    peopleMet: {type: Array},
})

module.exports = mongoose.model('members', members)