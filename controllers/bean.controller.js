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
      seed,
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
    const polls = await Poll.find({ contentType: "poll" }).sort("endDate");
    res.json(polls);
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

    // Find the poll by ID
    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    // Check if the option exists within the poll
    const winningOption = poll.options.find(
      (option) => option._id.toString() === optionId
    );
    if (!winningOption) {
      return res.status(400).json({ message: "Invalid option ID" });
    }

    // Update the poll winner
    poll.winner = optionId;
    await poll.save();

    const totalBettors = new Set(poll.options.flatMap((opt) => opt.bettors))
      .size;
    const winningBettors = winningOption.bettors.length;

    // Case 1: If everyone chose correctly, refund their entry fee without recording a win
    if (winningBettors === totalBettors) {
      await Promise.all(
        winningOption.bettors.map(async (userId) => {
          const user = await User.findById(userId);
          if (user) {
            user.beans += poll.pricePerShare;
            await user.save();
          }
        })
      );
      return res.json({ message: "All bettors refunded, no winner recorded" });
    }

    // Payout 15% of the jackpot to the poll creator
    let jackpot = poll.pot;
    const creator = await User.findById(poll.creatorId);
    if (creator) {
      const payout = Math.floor(jackpot * 0.15);
      creator.beans += payout;
      await creator.save();
      jackpot -= payout;
    }

    // Case 2: If no one chose the correct option, give the remaining jackpot to fallback user
    if (winningBettors === 0) {
      const fallbackUser = await User.findById("67bbdee28094dd05bc218d1d");
      if (fallbackUser) {
        fallbackUser.beans += jackpot;
        await fallbackUser.save();
      }
      return res.json({
        message: "No correct votes, jackpot given to the house",
      });
    }

    // Case 3: Distribute the jackpot among winning bettors and record their win
    await User.updateMany(
      { _id: { $in: winningOption.bettors } },
      { $push: { wins: pollId } }
    );

    const payoutPerShare = Math.floor(jackpot / winningBettors);
    await Promise.all(
      winningOption.bettors.map(async (userId) => {
        const user = await User.findById(userId);
        if (user) {
          user.beans += payoutPerShare;
          await user.save();
        }
      })
    );

    res.json({
      message: "Winner set, creator paid, jackpot distributed",
      poll,
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
