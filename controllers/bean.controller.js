const { Poll } = require("../models/beans.model.js");

// Helper function to generate random string (for titles, descriptions, etc.)
const generateRandomString = (length) => {
  const characters =
    "ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789";
  let result = "";
  for (let i = 0; i < length; i++) {
    result += characters.charAt(Math.floor(Math.random() * characters.length));
  }
  return result;
};

// Helper function to generate random options for the poll
const generateRandomOptions = (numOptions = 3) => {
  let options = [];
  for (let i = 0; i < numOptions; i++) {
    options.push({
      text: `Option ${i + 1}: ${generateRandomString(10)}`, // Random option text
      betters: [],
    });
  }
  return options;
};

// Create a random poll
exports.createRandomPoll = async (req, res, next) => {
  try {
    const creatorId = `user${Math.floor(Math.random() * 1000)}`; // Random creator ID
    const title = `Poll: ${generateRandomString(10)}`; // Random poll title
    const description = `Description: ${generateRandomString(30)}`; // Random description
    const endDate = new Date();
    endDate.setDate(endDate.getDate() + Math.floor(Math.random() * 10)); // Random end date (1-10 days from now)
    const options = generateRandomOptions(); // Generate random poll options

    const poll = new Poll({ creatorId, title, description, endDate, options });
    await poll.save();

    res.status(201).json({ message: "Random poll created successfully", poll });
  } catch (error) {
    next(error);
  }
};

// Create a new poll
exports.createPoll = async (req, res, next) => {
  try {
    const { creatorId, title, description, endDate, options } = req.body;

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
    const polls = await Poll.find().sort("-endDate");
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

// Place a bet (vote) on an option
exports.placeBet = async (req, res, next) => {
  try {
    const { pollId, optionIndex, userId } = req.body;

    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    // Validate option index
    if (
      !Number.isInteger(optionIndex) ||
      optionIndex < 0 ||
      optionIndex >= poll.options.length
    ) {
      return res.status(400).json({ message: "Invalid option index" });
    }

    poll.options[optionIndex].betters.push(userId);
    await poll.save();

    res.json({ message: "Bet placed successfully", poll });
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
