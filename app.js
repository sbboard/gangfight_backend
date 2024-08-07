const express = require("express");
var fs = require("fs");
const fileUpload = require("express-fileupload");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const MONDO_SECRET = require("./mondosecret.js");

//connect to mongoDB
const dev_db_url = `mongodb+srv://buffum:${MONDO_SECRET}@gangu-t2mbg.mongodb.net/test`;
const mongoDB = process.env.MONGODB_URI || dev_db_url;
mongoose.connect(mongoDB, { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.Promise = global.Promise;
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));

const app = express();
app.use(fileUpload());
app.use(function (req, res, next) {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Access-Control-Allow-Methods", "GET,PUT,POST,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Headers, Access-Control-Allow-Origin, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Authorization"
  );
  return next();
});
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const product = require("./routes/content.route");

app.use("/api", product);

const port = process.env.PORT || 8128;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
