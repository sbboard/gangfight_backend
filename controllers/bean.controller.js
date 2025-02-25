const { Poll, User } = require("../models/beans.model.js");

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
    } = req.body;

    if (seed < pricePerShare) {
      return res
        .status(400)
        .json({ message: "Seed must be at least the price per share" });
    }

    // Find the user and deduct 2 beans
    const user = await User.findById(creatorId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.beans < seed) {
      return res.status(400).json({ message: "Insufficient beans" });
    }

    if (user.role == "spectator" || user.role == "bettor" || !user.role) {
      user.role = "bookie";
    }
    user.beans -= seed;
    await user.save();

    // Create the poll
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
    });
    await poll.save();

    res.status(201).json({
      message: "Poll created successfully",
      poll,
      newBeanAmt: user.beans,
    });
  } catch (error) {
    next(error);
  }
};

// Get all polls
exports.getAllPolls = async (req, res, next) => {
  try {
    const polls = await Poll.find({ contentType: "poll" })
      .sort("endDate")
      .lean();

    // Fetch all unique creator IDs
    const creatorIds = [...new Set(polls.map((poll) => poll.creatorId))];

    // Fetch user details for all creators
    const users = await User.find({ _id: { $in: creatorIds } })
      .select("name displayName")
      .lean();
    const userMap = Object.fromEntries(
      users.map((user) => [user._id.toString(), user.displayName || user.name])
    );

    // Attach creator names to polls
    const pollsWithCreators = polls.map((poll) => ({
      ...poll,
      creatorName: userMap[poll.creatorId],
    }));

    res.json(pollsWithCreators);
  } catch (error) {
    next(error);
  }
};

// Get a specific poll by ID
exports.getPollById = async (req, res, next) => {
  try {
    const poll = await Poll.findById(req.params.id);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    res.json(poll);
  } catch (error) {
    next(error);
  }
};

// Place a bet (vote) on an option using optionId
exports.placeBet = async (req, res, next) => {
  try {
    const { pollId, optionId, userId, shares } = req.body;

    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    // Find the option by ID
    const option = poll.options.find((opt) => opt._id.toString() === optionId);
    if (!option) {
      return res.status(400).json({ message: "Invalid option ID" });
    }

    // Validate shares
    if (!shares || shares < 1) {
      return res.status(400).json({ message: "Invalid number of shares" });
    }

    // Find the user and check if they have enough beans
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const totalCost = poll.pricePerShare * shares;
    if (user.beans < totalCost) {
      return res.status(400).json({ message: "Insufficient beans" });
    }

    if (user.role == "spectator" || !user.role) user.role = "bettor";

    // Deduct beans and save the user
    user.beans -= totalCost;
    await user.save();

    // Update the poll pot and add the user to the bettors array
    poll.pot += totalCost;

    // Add user to the bettors array as many times as shares bought
    option.bettors.push(...Array(shares).fill(userId));
    await poll.save();

    res.json({
      message: "Bet placed successfully",
      poll,
      newBeanAmt: user.beans,
    });
  } catch (error) {
    next(error);
  }
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
      await User.findByIdAndUpdate("67bbdee28094dd05bc218d1d", {
        $inc: { beans: jackpot },
      });
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
          $push: { wins: pollId },
        });
      })
    );

    res.json({
      message: "Winner set, creator paid, jackpot distributed",
      poll,
      user: creator,
    });
  } catch (error) {
    next(error);
  }
};

// Delete a poll
exports.deletePoll = async (req, res, next) => {
  try {
    const deletedPoll = await Poll.findByIdAndDelete(req.params.id);
    if (!deletedPoll)
      return res.status(404).json({ message: "Poll not found" });
    res.json({ message: "Poll deleted successfully" });
  } catch (error) {
    next(error);
  }
};
