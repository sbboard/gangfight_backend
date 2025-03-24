import express, { Request, Response, NextFunction } from "express";
import fileUpload from "express-fileupload";
import bodyParser from "body-parser";
import mongoose from "mongoose";
import product from "./routes/content.route.js";
import beanRoutes from "./routes/bean.route.js";
import startTaxSchedule from "./routines/taxCollector.js";
import { fileURLToPath } from "url";
import { dirname } from "path";
import dotenv from "dotenv";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: `${__dirname}/.env` });

const MONDO_SECRET = process.env.MONDO_SECRET;
const mongoDB = `mongodb+srv://buffum:${MONDO_SECRET}@gangu-t2mbg.mongodb.net/test`;
mongoose.connect(mongoDB);
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => console.log("Connected to MongoDB successfully"));

const app = express();

// Middleware to switch to 'beans' database for /api/beans routes
app.use((req: Request, res: Response, next: NextFunction) => {
  if (req.originalUrl.startsWith("/api/beans")) {
    req.beansDb = db.useDb("beans");
  } else req.beansDb = db;
  next();
});

// Corrected CORS Middleware with explicit types for Request, Response, and NextFunction
app.use((req: Request, res: Response, next: NextFunction): void => {
  const allowedDomains = [
    "bigbean.bet",
    "www.bigbean.bet",
    "gang-fight.com",
    "www.gang-fight.com",
  ];

  const origin = req.headers.origin;
  const host = req.headers.host?.split(":")[0];

  if (req.headers.host === "localhost:8128") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (!origin || origin === `https://${host}`) {
    res.setHeader("Access-Control-Allow-Origin", `https://${host}`);
  } else if (allowedDomains.includes(new URL(origin).hostname)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  // Set other CORS headers
  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Headers, Access-Control-Allow-Origin, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Authorization"
  );

  // Disable Referrer-Policy
  res.setHeader("Referrer-Policy", "no-referrer");

  // Handle preflight OPTIONS request
  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  next();
});

app.use(fileUpload());
app.use(bodyParser.json());
app.use(bodyParser.urlencoded({ extended: false }));

app.use("/api", product);
app.use("/api/beans", beanRoutes);

const port = process.env.PORT || 8128;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Start tax schedule
startTaxSchedule();

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send({ error: "Something went wrong!" });
});
