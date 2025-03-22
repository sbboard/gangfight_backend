const { User } = require("../models/beans.model");
let userCache = {};

const sanitizePoll = async (poll, requestingUserId) => {
  if (!poll) return null;

  const sanitizedPoll = poll.toObject ? poll.toObject() : { ...poll };

  const userIds = [
    sanitizedPoll.creatorId,
    ...sanitizedPoll.options.flatMap((option) => option.bettors),
  ];

  const uniqueUserIds = [...new Set(userIds)];
  const uncachedUserIds = uniqueUserIds.filter((userId) => !userCache[userId]);
  if (uncachedUserIds.length > 0) {
    const users = await User.find({ _id: { $in: uncachedUserIds } })
      .select("name")
      .lean();
    users.forEach((user) => (userCache[user._id.toString()] = user.name));
  }

  // Assign cached user names
  sanitizedPoll.creatorName = userCache[sanitizedPoll.creatorId] || "Unknown";
  delete sanitizedPoll.creatorId;

  sanitizedPoll.options = sanitizedPoll.options.map((option) => ({
    ...option,
    bettors: option.bettors.map((bettorId) =>
      bettorId === requestingUserId ? bettorId : userCache[bettorId.toString()]
    ),
  }));

  return sanitizedPoll;
};

module.exports = sanitizePoll;
