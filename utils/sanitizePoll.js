const sanitizePoll = async (poll, requestingUserId) => {
  if (!poll) return null;

  const sanitizedPoll = poll.toObject ? poll.toObject() : { ...poll };

  const User = require("../models/beans.model"); // Adjust path as needed
  const creator = await User.findById(sanitizedPoll.creatorId)
    .select("name")
    .lean();
  sanitizedPoll.creatorName = creator ? creator.name : "Unknown";

  delete sanitizedPoll.creatorId;

  // Replace bettor IDs with "dummy", except for the requesting user
  sanitizedPoll.options = sanitizedPoll.options.map((option) => ({
    ...option,
    bettors: option.bettors.map((bettorId) =>
      bettorId === requestingUserId ? bettorId : "dummy"
    ),
  }));

  return sanitizedPoll;
};

module.exports = sanitizePoll;
