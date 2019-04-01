const express = require('express')
var cors = require('cors')
const bodyParser = require('body-parser')
const mongoose = require('mongoose')
const dbpass = require('./secret.js')

const dev_db_url = `mongodb+srv://buffum:${dbpass}@gangu-t2mbg.mongodb.net/test`
const mongoDB = process.env.MONGODB_URI || dev_db_url
mongoose.connect(mongoDB, {useNewUrlParser: true})
mongoose.Promise = global.Promise
const db = mongoose.connection
db.on('error', console.error.bind(console, 'MongoDB connection error:'))

const app = express()
let whitelist = [
    'http://107.188.145.8:8080',
    'http://159.65.188.38:80',
];
let corsOptions = {
    origin: function(origin, callback){
        var originIsWhitelisted = whitelist.indexOf(origin) !== -1;
        callback(null, originIsWhitelisted);
    },
    credentials: true
};
app.use(cors(corsOptions));
app.use(bodyParser.json())
app.use(bodyParser.urlencoded({extended: false}))

const product = require('./routes/content.route')

app.use('/api', product)

const port = (process.env.PORT || 8128)

app.listen(port, () => {
    console.log(`Server is running on port ${port}`)
})