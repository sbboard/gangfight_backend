const express = require("express");
const fileUpload = require("express-fileupload");
const bodyParser = require("body-parser");
const mongoose = require("mongoose");
const MONDO_SECRET = require("./mondosecret.js");

const mongoDB = `mongodb+srv://buffum:${MONDO_SECRET}@gangu-t2mbg.mongodb.net/test`;
mongoose.connect(mongoDB, { useNewUrlParser: true, useUnifiedTopology: true });
mongoose.Promise = global.Promise;
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));

const app = express();

// Middleware to switch to 'beans' database for /api/beans routes
app.use((req, res, next) => {
  if (req.originalUrl.startsWith("/api/beans")) {
    req.beansDb = db.useDb("beans");
  } else req.beansDb = db;
  next();
});

app.use(function (req, res, next) {
  // Allowed base domains (without the 'www.' prefix)
  const allowedBaseDomains = ["bigbean.bet", "gang-fight.com"];

  // Get the 'Origin' header and normalize it by stripping 'www.'
  const origin = req.headers.origin;
  if (!origin) {
    return res.status(403).json({ message: "Forbidden: No origin header" });
  }
  const parsedOrigin = new URL(origin);
  const originHost = parsedOrigin.hostname.replace(/^www\./, "");

  // Validate the 'Origin' header
  if (!allowedBaseDomains.includes(originHost)) {
    return res
      .status(403)
      .json({ message: `Forbidden: Invalid origin (${originHost})` });
  }

  // Set the correct CORS headers
  res.setHeader("Access-Control-Allow-Origin", origin); // Allow the exact origin
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Headers, Access-Control-Allow-Origin, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Authorization"
  );

  // If the request is an OPTIONS request (preflight), respond with a 200 status
  if (req.method === "OPTIONS") {
    return res.status(200).end(); // Respond successfully to preflight
  }

  // Continue to the next middleware
  return next();
});

app.use(fileUpload());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

const product = require("./routes/content.route");
const beanRoutes = require("./routes/bean.route");

app.use("/api", product);
app.use("/api/beans", beanRoutes);

const port = process.env.PORT || 8128;

app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});
