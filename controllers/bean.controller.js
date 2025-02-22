const { Poll, User } = require("../models/beans.model.js");

// Create a new poll
exports.createPoll = async (req, res, next) => {
  try {
    const { creatorId, title, description, endDate, options } = req.body;

    // Find the user and deduct 2 beans
    const user = await User.findById(creatorId);
    if (!user) {
      return res.status(404).json({ message: "User not found" });
    }
    if (user.beans < 2) {
      return res.status(400).json({ message: "Insufficient beans" });
    }

    user.beans -= 2;
    await user.save();

    // Create the poll
    const poll = new Poll({ creatorId, title, description, endDate, options });
    await poll.save();

    res.status(201).json({ message: "Poll created successfully", poll });
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

    // Deduct beans and save the user
    user.beans -= totalCost;
    await user.save();

    // Add user to the bettors array as many times as shares bought
    option.bettors.push(...Array(shares).fill(userId));
    await poll.save();

    res.json({ message: "Bet placed successfully", poll });
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

    // Update the winner field
    poll.winner = optionId;
    await poll.save();

    // Add a win to all users who voted for the winning option
    await User.updateMany(
      { _id: { $in: winningOption.bettors } },
      { $push: { wins: pollId } }
    );

    // Payout 10% of the jackpot to the poll creator
    let jackpot = poll.pot;
    const creator = await User.findById(poll.creatorId);
    if (creator) {
      const payout = Math.floor(poll.pot * 0.1);
      creator.beans += payout;
      await creator.save();
      jackpot -= payout;
    }

    res.json({
      message: "Winner set successfully, creator paid out, wins updated",
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
