import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";

// .env is copied next to app.js in dist/ by the build
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, ".env") });

export const {
  MONDO_SECRET,
  ROUTE_SECRET,
  PATREON_ACCESS_TOKEN,
  PORT,
  BEAN_HOUSE_ID: HOUSE_ID,
  BEAN_DUPE_ID: DUPE_ID,
} = process.env;

export const MONGO_URI = `mongodb+srv://buffum:${MONDO_SECRET}@gangu-t2mbg.mongodb.net/test`;
