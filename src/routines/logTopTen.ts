import cron from "node-cron";
import { User, Bettor } from "../models/beans.model.js";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const HOUSE_ID = process.env.BEAN_HOUSE_ID;
const DUPE_ID = process.env.BEAN_DUPE_ID;

async function logTopTen(): Promise<void> {
  try {
    const users = await User.find({
      contentType: "user",
      _id: { $nin: [HOUSE_ID, DUPE_ID] },
    });

    const topTen = users
      .sort((a: Bettor, b: Bettor) => b.beans - a.beans)
      .slice(0, 10);
    const topTenWins = users
      .sort((a: Bettor, b: Bettor) => b.wins.length - a.wins.length)
      .slice(0, 10);

    const newEntry = {
      date: new Date(),
      beans: topTen.map((user: Bettor) => user.displayName || user.name),
      wins: topTenWins.map((user: Bettor) => user.displayName || user.name),
    };

    // File path
    const filePath = join(__dirname, "..", "topTenLog.json");

    // Read the existing file (if it exists)
    let logData: object[] = [];
    if (fs.existsSync(filePath)) {
      try {
        const fileContent = fs.readFileSync(filePath, "utf8");
        logData = JSON.parse(fileContent); // Parse existing JSON
        if (!Array.isArray(logData)) logData = []; // Ensure it's an array
      } catch (err) {
        console.error("Error reading existing log file:", err);
        logData = [];
      }
    }

    // Append the new entry
    logData.push(newEntry);

    // Write back as a proper JSON array
    fs.writeFileSync(filePath, JSON.stringify(logData, null, 2), "utf8");

    console.log("Top 10s logged successfully");
  } catch (error) {
    console.error("Error logging top 10s:", error);
  }
}

export default function startLogTopTen(): void {
  console.log("🕒 Top 10 Logging Scheduled");
  cron.schedule("30 20 * * *", logTopTen, {
    timezone: "America/New_York",
  });
}
