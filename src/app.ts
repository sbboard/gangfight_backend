import { MONGO_URI, PORT } from "./env.js";
import express, { Request, Response, NextFunction } from "express";
import fileUpload from "express-fileupload";
import mongoose from "mongoose";
import product from "./routes/content.route.js";
import beanRoutes from "./routes/bean.route.js";
import startTaxSchedule from "./routines/taxCollector.js";
import startWinCleaner from "./routines/winCheck.js";
import startLogTopTen from "./routines/logTopTen.js";
import startRepopulation from "./routines/repopulateWins.js";

mongoose.connect(MONGO_URI);
const db = mongoose.connection;
db.on("error", console.error.bind(console, "MongoDB connection error:"));
db.once("open", () => console.log("Connected to MongoDB successfully"));

const app = express();

const allowedDomains = [
  "bigbean.bet",
  "www.bigbean.bet",
  "gang-fight.com",
  "www.gang-fight.com",
];

const hostnameOf = (origin: string): string | null => {
  try {
    return new URL(origin).hostname;
  } catch {
    return null;
  }
};

app.use((req: Request, res: Response, next: NextFunction): void => {
  const origin = req.headers.origin;
  const host = req.headers.host?.split(":")[0];

  if (req.headers.host === "localhost:8128") {
    res.setHeader("Access-Control-Allow-Origin", "*");
  } else if (!origin || origin === `https://${host}`) {
    res.setHeader("Access-Control-Allow-Origin", `https://${host}`);
  } else if (allowedDomains.includes(hostnameOf(origin) ?? "")) {
    res.setHeader("Access-Control-Allow-Origin", origin);
  }

  res.setHeader("Access-Control-Allow-Methods", "GET,POST,PUT,DELETE,OPTIONS");
  res.setHeader("Access-Control-Allow-Credentials", "true");
  res.setHeader(
    "Access-Control-Allow-Headers",
    "Access-Control-Allow-Headers, Access-Control-Allow-Origin, Origin, Accept, X-Requested-With, Content-Type, Access-Control-Request-Method, Access-Control-Request-Headers, Authorization"
  );
  res.setHeader("Referrer-Policy", "no-referrer");

  if (req.method === "OPTIONS") {
    res.status(200).end();
    return;
  }

  next();
});

app.use(fileUpload());
app.use(express.json());
app.use(express.urlencoded({ extended: false }));

app.use("/api", product);
app.use("/api/beans", beanRoutes);

app.use((err: Error, _req: Request, res: Response, _next: NextFunction) => {
  console.error(err.stack);
  res.status(500).send({ error: "Something went wrong!" });
});

const port = PORT || 8128;
app.listen(port, () => {
  console.log(`Server is running on port ${port}`);
});

// Start routines
// startRepopulation(); only run when necessary
//startWinCleaner(); //DAILY @7PM
//startTaxSchedule(); //SUNDAY @8PM
//startLogTopTen(); //DAILY @8:30PM
