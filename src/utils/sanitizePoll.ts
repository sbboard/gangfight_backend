import { PollOption, User } from "../models/beans.model.js";
import { Bettor, Poll } from "../models/beans.model";

let userCache: Record<string, string> = {};

const sanitizePoll = async (
  poll: Poll,
  requestingUserId: string
): Promise<Poll | null> => {
  if (!poll) return null;

  const sanitizedPoll: Poll = poll.toObject
    ? (poll.toObject() as Poll)
    : ({ ...poll } as Poll);

  const userIds = [
    sanitizedPoll.creatorId || "",
    ...sanitizedPoll.options.flatMap((option) => option.bettors),
  ];

  const uniqueUserIds = [...new Set(userIds)];
  const uncachedUserIds = uniqueUserIds.filter((userId) => !userCache[userId]);

  if (uncachedUserIds.length > 0) {
    const users = await User.find({ _id: { $in: uncachedUserIds } })
      .select("name")
      .lean<Bettor[]>(); // ✅ Explicitly type the query result

    // Populate the cache with the fetched user names
    users.forEach((user) => (userCache[user._id.toString()] = user.name));
  }

  // Assign cached user names
  sanitizedPoll.creatorName = sanitizedPoll.creatorId
    ? userCache[sanitizedPoll.creatorId] || "Unknown"
    : "Unknown";
  delete sanitizedPoll.creatorId;

  // Map through options and replace bettor IDs with names or user IDs for the requesting user
  sanitizedPoll.options = sanitizedPoll.options.map((option) => ({
    ...option,
    bettors: option.bettors.map((bettorId) =>
      bettorId === requestingUserId ? bettorId : userCache[bettorId.toString()]
    ),
  })) as PollOption[];

  return sanitizedPoll;
};

export default sanitizePoll;
