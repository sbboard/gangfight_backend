const express = require('express')
var fs = require('fs');
const fileUpload = require('express-fileupload');
const bodyParser = require('body-parser')
const mongoose = require('mongoose')

//connect to mongoDB
const dev_db_url = `mongodb+srv://buffum:${process.env.MONDO_SECRET}@gangu-t2mbg.mongodb.net/test`
const mongoDB = process.env.MONGODB_URI || dev_db_url
mongoose.connect(mongoDB, {useNewUrlParser: true})
mongoose.Promise = global.Promise
const db = mongoose.connection
db.on('error', console.error.bind(console, 'MongoDB connection error:'))

const app = express()
app.use(fileUpload());
app.use(function (req, res, next) {
    res.setHeader('Access-Control-Allow-Origin',  "http://159.65.188.38");
    return next();
});
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: false}))

const product = require('./routes/content.route')

app.use('/api', product)

const port = (process.env.PORT || 8128)

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})