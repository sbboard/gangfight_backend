import mongoose from "mongoose";
import { Poll, PollOption, User } from "../models/beans.model.js";

// Swaps creator/bettor IDs for display names, looking every user up in a single query.
// The requesting user's own bets keep their ID so the client can spot them.
export const sanitizePolls = async (
  polls: Poll[],
  requestingUserId?: string
): Promise<Poll[]> => {
  const plainPolls = polls.map(
    (poll) => (poll.toObject ? poll.toObject() : { ...poll }) as Poll
  );

  const userIds = new Set<string>();
  for (const poll of plainPolls) {
    if (poll.creatorId) userIds.add(poll.creatorId.toString());
    for (const option of poll.options) {
      option.bettors.forEach((id) => userIds.add(id.toString()));
    }
  }

  const users = await User.find({
    _id: { $in: [...userIds].filter((id) => mongoose.isValidObjectId(id)) },
  })
    .select("name displayName")
    .lean<{ _id: mongoose.Types.ObjectId; name: string; displayName?: string }[]>();
  const names = new Map(
    users.map((user) => [user._id.toString(), user.displayName || user.name])
  );

  return plainPolls.map((poll) => {
    poll.creatorName =
      (poll.creatorId && names.get(poll.creatorId.toString())) || "Unknown";
    delete poll.creatorId;

    //replace deprecated winner field with winners
    if (poll.winner && !poll.winners.length) {
      poll.winners = [poll.winner];
      delete poll.winner;
    }

    poll.options = poll.options.map((option) => ({
      ...option,
      bettors: option.bettors.map((bettorId) =>
        bettorId.toString() === requestingUserId
          ? bettorId
          : names.get(bettorId.toString())
      ),
    })) as PollOption[];

    return poll;
  });
};

const sanitizePoll = async (
  poll: Poll,
  requestingUserId?: string
): Promise<Poll> => (await sanitizePolls([poll], requestingUserId))[0];

export default sanitizePoll;
