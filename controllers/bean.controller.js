const { Poll, User } = require("../models/beans.model.js");
const sanitizePoll = require("../utils/sanitizePoll.js");
const sanitizeUser = require("../utils/sanitizeUser.js");

// Create a new poll
exports.createPoll = async (req, res, next) => {
  try {
    const {
      creatorId,
      title,
      description,
      endDate,
      settleDate,
      options,
      pricePerShare,
      seed,
      betPerWager,
    } = req.body;

    if (betPerWager < 2) delete betPerWager;

    if (betPerWager > Math.floor(options.length / 2)) {
      return res.status(400).json({
        message: "Bet per wager cannot exceed half the number of options",
      });
    }

    if (seed < pricePerShare) {
      return res
        .status(400)
        .json({ message: "Seed must be at least the price per share" });
    }

    if (betPerWager && seed < pricePerShare * betPerWager) {
      return res.status(400).json({
        message:
          "Seed must be at least the price per share times the bet per wager",
      });
    }

    if (options.length < 2) {
      return res
        .status(400)
        .json({ message: "At least 2 options are required" });
    }

    if (options.length > 15) {
      return res.status(400).json({ message: "Maximum of 15 options allowed" });
    }

    const user = await User.findById(creatorId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.beans < seed) {
      return res.status(400).json({ message: "Insufficient beans" });
    }

    const hasBookieLicense = user.inventory.some(
      (item) => item.name === "bookie license"
    );
    if (!hasBookieLicense) {
      return res
        .status(400)
        .json({ message: "User does not have a bookie license" });
    }

    if (user.role == "spectator" || user.role == "bettor" || !user.role) {
      user.role = "bookie";
    }

    user.beans -= seed;
    await user.save();

    const poll = new Poll({
      creatorId,
      title,
      description,
      endDate,
      settleDate,
      options,
      pricePerShare,
      seed: seed * 2,
      pot: seed * 2,
      betPerWager,
    });
    await poll.save();

    const highRoller = pricePerShare >= 10_000_000;
    const highProfile = seed * 2 >= 10_000_000;

    if (highRoller || highProfile) {
      const notification = {
        text: `A ${
          highRoller ? "HIGH ROLLER" : "HIGH PROFILE"
        } BET HAS BEEN STARTED: ${title}`,
      };
      await User.updateMany(
        { userType: "user" },
        { $push: { notifications: notification } }
      );
    }

    res.status(201).json({
      message: "Poll created successfully",
      newBeanAmt: user.beans,
    });
  } catch (error) {
    next(error);
  }
};

// Get all polls
exports.getAllPolls = async (req, res, next) => {
  try {
    const { userId } = req.query;
    const polls = await Poll.find({ contentType: "poll" })
      .sort("endDate")
      .lean();

    const cleanedPolls = await Promise.all(
      polls.map((poll) => sanitizePoll(poll, userId))
    );

    res.json(cleanedPolls);
  } catch (error) {
    next(error);
  }
};

// Get a specific poll by ID
exports.getPollById = async (req, res, next) => {
  try {
    const { userId } = req.query;
    const { pollId } = req.params;

    if (!pollId) return res.status(400).json({ message: "Poll ID required" });
    if (!userId) return res.status(400).json({ message: "User ID required" });

    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    res.json(await sanitizePoll(poll, userId));
  } catch (error) {
    next(error);
  }
};

// Place a bet (vote) on an option using optionId
exports.placeBet = async (req, res, next) => {
  try {
    const { pollId, optionId, userId, shares, optionsArray } = req.body;

    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    if (poll.endDate < Date.now())
      return res.status(400).json({ message: "Poll has ended" });

    if (!shares || shares < 1)
      return res.status(400).json({ message: "Invalid number of shares" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (poll.betPerWager && poll.betPerWager > 1) {
      await placeMultipleBets(poll, user, optionsArray, shares);
    } else {
      await placeSingleBet(poll, user, optionId, shares);
    }

    if (user.role == "spectator" || !user.role) user.role = "bettor";

    res.json({
      message: "Bet placed successfully",
      poll: await sanitizePoll(poll, userId),
      newBeanAmt: user.beans,
    });
  } catch (error) {
    next(error);
  }
};

const placeSingleBet = async (poll, user, optionId, shares) => {
  const option = poll.options.find((opt) => opt._id.toString() === optionId);
  if (!option) throw new Error("Invalid option ID");

  const totalCost = poll.pricePerShare * shares;
  if (user.beans < totalCost) {
    return res.status(400).json({ message: "Insufficient beans" });
  }

  user.beans -= totalCost;
  poll.pot += totalCost;

  option.bettors.push(...Array(shares).fill(user._id));

  await poll.save();
  await user.save();
};

const placeMultipleBets = async (poll, user, optionsArray, shares) => {
  if (!Array.isArray(optionsArray) || optionsArray.length === 0) {
    throw new Error("Invalid options array");
  }

  if (optionsArray.length > poll.betPerWager) {
    throw new Error("Invalid number of options");
  }

  const totalCost = optionsArray.length * poll.pricePerShare * shares;
  if (user.beans < totalCost) {
    return res.status(400).json({ message: "Insufficient beans" });
  }

  optionsArray.forEach((optionId) => {
    const option = poll.options.find((opt) => opt._id.toString() === optionId);
    if (!option) throw new Error("Invalid option ID");

    option.bettors.push(...Array(shares).fill(user._id));
  });

  user.beans -= totalCost;
  poll.pot += totalCost;

  await poll.save();
  await user.save();
};

// Set the winner of a poll
exports.setPollWinner = async (req, res, next) => {
  try {
    const { pollId, optionId } = req.body;

    const poll = await Poll.findById(pollId);
    if (!poll || poll.winner) {
      return res
        .status(poll ? 400 : 404)
        .json({ message: poll ? "Winner already set" : "Poll not found" });
    }

    // Find the winning option
    const winningOption = poll.options.find(
      (opt) => opt._id.toString() === optionId
    );
    if (!winningOption)
      return res.status(400).json({ message: "Invalid option ID" });

    // Set the winner and save
    poll.winner = optionId;
    await poll.save();

    // Calculate total bets and winning bets
    const totalBettors = poll.options.reduce(
      (sum, opt) => sum + opt.bettors.length,
      0
    );
    const winningBettors = winningOption.bettors.length;

    // If everyone won, refund their entry fee and exit
    if (winningBettors === totalBettors) {
      await User.updateMany(
        { _id: { $in: winningOption.bettors } },
        { $inc: { beans: poll.pricePerShare } }
      );
      return res.json({ message: "All bettors refunded, no winner recorded" });
    }

    // Payout 5% of the jackpot to the creator
    let jackpot = poll.pot;
    const creator = await User.findById(poll.creatorId);
    if (creator) {
      const creatorPayout = Math.floor(jackpot * 0.05);
      creator.beans += creatorPayout;
      await creator.save();
      jackpot -= creatorPayout;
    }

    // If no one won, give the remaining jackpot to fallback user
    if (winningBettors === 0) {
      await User.findByIdAndUpdate(HOUSE_ID, { $inc: { beans: jackpot } });
      return res.json({
        message: "No correct votes, jackpot given to the house",
        user: creator,
      });
    }

    // Track total payout per user
    const userPayouts = new Map();
    winningOption.bettors.forEach((userId) => {
      userPayouts.set(
        userId,
        (userPayouts.get(userId) || 0) + Math.floor(jackpot / winningBettors)
      );
    });

    // Process user payouts in batch
    await Promise.all(
      Array.from(userPayouts.entries()).map(async ([userId, totalPayout]) => {
        await User.findByIdAndUpdate(userId, {
          $inc: { beans: totalPayout },
          $push: {
            wins: pollId,
            notifications: {
              text: `Congratulations! You won ${totalPayout.toLocaleString()} from the wager "${
                poll.title
              }".`,
            },
          },
        });
      })
    );

    await User.updateMany(
      {
        _id: {
          $in: poll.options
            .filter((opt) => opt._id.toString() !== optionId)
            .flatMap((opt) => opt.bettors),
        },
      },
      {
        $push: {
          notifications: {
            text: `Sorry! You lost the wager "${poll.title}". We're sorry this happened to you but please remember - never stop betting! The only way to truly lose is to quit before your big win.`,
          },
        },
      }
    );

    // Re-fetch user data to include updated bean amount and wins
    const updatedCreator = await User.findById(creator._id);

    res.json({
      message: "Winner set, creator paid, jackpot distributed",
      user: sanitizeUser(updatedCreator),
    });
  } catch (error) {
    next(error);
  }
};

exports.makeWagerIllegal = async (req, res, next) => {
  try {
    const { pollId, userId, userKey, lawsBroken } = req.body;

    // Fetch user and validate admin role
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "admin")
      return res.status(403).json({ message: "User is not an admin" });
    if (user.password.slice(-10) !== userKey)
      return res.status(403).json({ message: "Invalid key" });

    // Fetch poll and validate existence
    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    // if poll is already illegal, return
    if (!poll.legalStatus.isLegal)
      return res.status(400).json({ message: "Wager already illegal" });

    //if poll is already settled, return
    if (poll.winner)
      return res.status(400).json({ message: "Wager already settled" });

    //if poll is already ended, return
    if (poll.endDate < Date.now())
      return res.status(400).json({ message: "Wager already ended" });

    //set End Date and settle date to now
    poll.endDate = Date.now();
    poll.settleDate = Date.now();

    // Mark poll as illegal
    poll.legalStatus = {
      isLegal: false,
      lawsBroken: lawsBroken.split(",").map((law) => law.trim()),
      dateBanned: new Date(),
    };
    await poll.save();

    // Fetch creator
    const creator = await User.findById(poll.creatorId);
    if (!creator) return res.status(404).json({ message: "Creator not found" });

    // Notify bettors
    const notification = {
      text: `ALERT: You are a victim! You bet in the wager "${poll.title}" which was found to be an illegal wager. 
      The wager has been closed, but ${creator.name} successfully stole all the beans associated with it.`,
    };

    await User.updateMany(
      { _id: { $in: poll.options.flatMap((opt) => opt.bettors) } },
      { $push: { notifications: notification } }
    );

    // Apply penalty and possible role change
    creator.penalties = (creator.penalties || 0) + 1;
    if (creator.penalties >= 3) {
      creator.role = "racketeer";
    }

    // Remove bookie license if present
    creator.inventory = creator.inventory.filter(
      (item) => item.name !== "bookie license"
    );

    // Notify creator
    const creatorNotification = {
      text:
        `Your wager "${poll.title}" was found to be illegal due to breaking the following laws: ${lawsBroken}.` +
        ` You did, however, successfully steal all ${poll.pot.toLocaleString()} beans associated with your illegal wager.` +
        (creator.penalties >= 3
          ? " You have been labeled a racketeer due to repeated offenses."
          : ""),
    };
    creator.notifications.push(creatorNotification);

    // Reward creator with the pot
    creator.beans += poll.pot;

    // Save creator changes
    await creator.save();

    res.json({ message: "Bet made illegal" });
  } catch (error) {
    next(error);
  }
};

exports.refundWager = async (req, res, next) => {
  try {
    const { pollId, userId, userKey } = req.body;

    // Validate admin
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "admin")
      return res.status(403).json({ message: "User is not an admin" });
    if (user.password.slice(-10) !== userKey)
      return res.status(403).json({ message: "Invalid key" });

    // Find poll
    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    // Refund all bettors
    const userRefunds = new Map();
    poll.options.forEach((option) => {
      option.bettors.forEach((bettorId) => {
        userRefunds.set(
          bettorId,
          (userRefunds.get(bettorId) || 0) + poll.pricePerShare
        );
      });
    });

    await Promise.all(
      Array.from(userRefunds.entries()).map(async ([bettorId, refundAmt]) => {
        await User.findByIdAndUpdate(bettorId, {
          $inc: { beans: refundAmt },
          $push: {
            notifications: {
              text: `Your bet in "${
                poll.title
              }" has been refunded. You received ${refundAmt.toLocaleString()} beans.`,
            },
          },
        });
      })
    );

    // Refund creator
    const creator = await User.findById(poll.creatorId);
    if (creator) {
      creator.beans += poll.seed / 2;
      creator.notifications.push({
        text: `Your wager "${
          poll.title
        }" has been refunded. Your initial seed of ${(
          poll.seed / 2
        ).toLocaleString()} beans has been returned.`,
      });
      await creator.save();
    }

    // Delete poll
    await Poll.findByIdAndDelete(pollId);

    res.json({ message: "All bets refunded, wager deleted" });
  } catch (error) {
    next(error);
  }
};
