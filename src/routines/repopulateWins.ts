import { User, Poll } from "../models/beans.model.js";
import cron from "node-cron";

//NOTE: This does NOT work with multi-bets currently
async function repopulateWins() {
  try {
    const polls = await Poll.find({ contentType: "poll" });

    const userWinsMap = new Map<string, Set<string>>();

    for (const poll of polls) {
      const winningOption = poll.winner;
      if (!winningOption) continue;

      const winningVotes = poll.options.find(
        (option) => option._id.toString() === winningOption
      )?.bettors;

      if (!winningVotes) continue;

      for (const voter of winningVotes) {
        if (!userWinsMap.has(voter)) {
          userWinsMap.set(voter, new Set());
        }
        userWinsMap.get(voter)!.add(poll._id.toString());
      }
    }

    const updates = Array.from(userWinsMap.entries()).map(
      async ([userId, pollIds]) => {
        await User.updateOne(
          { _id: userId },
          { $addToSet: { wins: { $each: Array.from(pollIds) } } }
        );
      }
    );

    await Promise.all(updates);
    console.log("✅ Wins repopulated");
  } catch (error) {
    console.error("Error repopulating wins:", error);
  }
}

export default function startRepopulation(): void {
  console.log("🕒 Win Repopulator scheduled every 2 minutes");
  cron.schedule("*/2 * * * *", repopulateWins, {
    timezone: "America/New_York",
  });
}
