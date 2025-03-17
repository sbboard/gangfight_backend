const cron = require("node-cron");
const { User, Poll } = require("./models/beans.model.js");
const { HOUSE_ID } = require("./beansecret.js");

const taxBrackets = [
  { threshold: 1_000_000_000, rate: 0.4 }, // 1B+ -> 40%
  { threshold: 500_000_000, rate: 0.3 }, // 500M+ -> 30%
  { threshold: 250_000_000, rate: 0.2 }, // 250M+ -> 20%
  { threshold: 100_000_000, rate: 0.1 }, // 100M+ -> 10%
];

async function collectBeanTaxes() {
  try {
    const oneWeekAgo = new Date();
    oneWeekAgo.setDate(oneWeekAgo.getDate() - 7);

    const users = await User.find({
      beans: { $gt: 100_000_000 },
      _id: { $ne: HOUSE_ID },
    });

    const updates = users.map(async (user) => {
      const recentPolls = await Poll.find({
        creatorId: user._id,
        creationDate: { $gte: oneWeekAgo },
      });

      if (recentPolls.length > 0) return null;

      const { rate } = taxBrackets.find(
        (bracket) => user.beans >= bracket.threshold
      ) || { rate: 0 };
      const tax = Math.floor(user.beans * rate);
      user.beans -= tax;

      return User.updateOne(
        { _id: user._id },
        {
          $set: { beans: user.beans },
          $push: {
            notifications: {
              text: `You were taxed ${tax.toLocaleString()} beans (${
                rate * 100
              }%). Thank you for your contribution to the community!`,
            },
          },
        }
      );
    });

    const validUpdates = updates.filter((update) => update !== null);

    await Promise.all(validUpdates);
  } catch (error) {
    console.error("❌ Error collecting bean taxes:", error);
  }
}

module.exports = function startTaxSchedule() {
  console.log("🕒 Bean tax scheduler initialized.");
  cron.schedule("0 20 * * 0", collectBeanTaxes, {
    timezone: "America/New_York",
  });
};
