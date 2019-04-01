const express = require('express')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const dev_db_url = require('./secret.js')

const mongoDB = process.env.MONGODB_URI || dev_db_url
mongoose.connect(mongoDB, {useNewUrlParser: true})
mongoose.Promise = global.Promise
const db = mongoose.connection
db.on('error', console.error.bind(console, 'MongoDB connection error:'))

const app = express()

app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: false}))

const product = require('./routes/product.route')

app.use('/api', product)

const port = (process.env.PORT || 8128)

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})