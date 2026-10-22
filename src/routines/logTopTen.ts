import cron from "node-cron";
import { User } from "../models/beans.model.js";
import fs from "fs";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import { HOUSE_ID, DUPE_ID } from "../env.js";
const __dirname = dirname(fileURLToPath(import.meta.url));

async function logTopTen(): Promise<void> {
  try {
    const users = await User.find({
      contentType: "user",
      _id: { $nin: [HOUSE_ID, DUPE_ID] },
    })
      .select("name displayName beans wins")
      .lean();

    const topTenNames = (score: (user: (typeof users)[number]) => number) =>
      [...users]
        .sort((a, b) => score(b) - score(a))
        .slice(0, 10)
        .map((user) => user.displayName || user.name);

    const newEntry = {
      date: new Date(),
      beans: topTenNames((user) => user.beans),
      wins: topTenNames((user) => user.wins.length),
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
