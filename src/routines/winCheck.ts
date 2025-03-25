import cron from "node-cron";
import { User, Poll, Bettor } from "../models/beans.model.js";

async function cleanWins(): Promise<void> {
  try {
    const users = await User.find({ contentType: "user" });
    const polls = await Poll.find({ contentType: "poll" });
    const pollIds = polls.map((poll) => poll._id.toString());
    const updates = users.map(async (user: Bettor) => {
      const wins = user.wins;
      const noDeletedWins = wins.filter((win: any) => pollIds.includes(win));
      const uniqueWins = Array.from(new Set(noDeletedWins));
      if (uniqueWins.length === wins.length) return;
      user.wins = uniqueWins;
      await user.save();
      console.log(`Cleaned wins for ${user.name}`);
    });
    await Promise.all(updates);
  } catch (error) {
    console.error("Error cleaning wins:", error);
  }
}

export default function startWinCleaner(): void {
  console.log("🕒 Win cleaner scheduled");
  cron.schedule("0 19 * * *", cleanWins, {
    timezone: "America/New_York",
  });
}
