import cron from "node-cron";
import { User, Poll } from "../models/beans.model.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const HOUSE_ID = process.env.BEAN_HOUSE_ID;
const DUPE_ID = process.env.BEAN_DUPE_ID;

const taxBrackets = [
  { threshold: 50_000_000_000, rate: 0.8 }, // 50B+ -> 80%
  { threshold: 10_000_000_000, rate: 0.75 }, // 10B+ -> 75%
  { threshold: 3_000_000_000, rate: 0.7 }, // 3B+ -> 70%
  { threshold: 1_000_000_000, rate: 0.5 }, // 1B+ -> 50%
  { threshold: 500_000_000, rate: 0.4 }, // 500M+ -> 40%
  { threshold: 250_000_000, rate: 0.2 }, // 250M+ -> 20%
  { threshold: 100_000_000, rate: 0.1 }, // 100M+ -> 10%
];

async function collectBeanTaxes(): Promise<void> {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const richUsers = await User.find({
      beans: { $gt: 100_000_000 },
      _id: { $nin: [HOUSE_ID, DUPE_ID] },
      $or: [
        { lastDonation: { $lt: oneWeekAgo } },
        { lastDonation: { $exists: false } },
      ],
    });

    const poorUsers = await User.find({
      beans: { $lt: 100_000_000 },
      _id: { $nin: [HOUSE_ID, DUPE_ID] },
    });

    const recentPolls = await Poll.find({
      creationDate: { $gte: oneWeekAgo },
    });

    // Collect unique bettors
    const recentBettors = recentPolls.flatMap((poll) =>
      poll.options.flatMap((opt) => opt.bettors)
    );
    const uniqueBettors = new Set(recentBettors);
    const poorBettors = poorUsers.filter((user) =>
      uniqueBettors.has(user._id.toString())
    );

    let taxedWealth = 0;
    const taxTheRich = richUsers.map(async (user) => {
      const userPolls = recentPolls.some(
        (poll) => poll.creatorId!.toString() === user._id.toString()
      );
      if (userPolls) return null;

      const bracket = taxBrackets.find((b) => user.beans >= b.threshold) || {
        rate: 0,
      };
      const tax = Math.floor(user.beans * bracket.rate);
      taxedWealth += tax;

      return User.updateOne(
        { _id: user._id },
        {
          $inc: { beans: -tax },
          $push: {
            notifications: {
              text: `You were taxed ${tax.toLocaleString()} beans (${
                bracket.rate * 100
              }%). Thank you for your contribution to the community!`,
            },
          },
        }
      );
    });

    await Promise.all(taxTheRich.filter(Boolean));

    let houseTax = taxedWealth * 0.25;
    taxedWealth = Math.floor(taxedWealth - houseTax);

    let share = Math.floor(taxedWealth / poorBettors.length);
    if (share > 500_000_000) {
      share = 500_000_000;
      houseTax += taxedWealth - share * poorBettors.length;
    }
    houseTax = Math.floor(houseTax);
    await User.updateOne({ _id: HOUSE_ID }, { $inc: { beans: houseTax } });

    if (poorBettors.length > 0 && share > 0) {
      const payThePoor = poorBettors.map((user) =>
        User.updateOne(
          { _id: user._id },
          {
            $inc: { beans: share },
            $push: {
              notifications: {
                text: `Wealth has been redistributed. Due to your participation this past week, you have received ${share.toLocaleString()} beans from the tax collection! Just so you're aware, the house pocketed ${houseTax.toLocaleString()} beans from the tax collection. Happy betting!`,
              },
            },
          }
        )
      );
      await Promise.all(payThePoor);
    }

    console.log(
      `💰 Tax collection complete! ${richUsers.length} rich users taxed and ${poorBettors.length} poor users paid.`
    );
  } catch (error) {
    console.error("❌ Error collecting bean taxes:", error);
  }
}

export default function startTaxSchedule(): void {
  console.log("🕒 Bean tax scheduler initialized.");
  //cron.schedule("*/2 * * * *", collectBeanTaxes, {
  cron.schedule("0 20 * * 0", collectBeanTaxes, {
    timezone: "America/New_York",
  });
}
