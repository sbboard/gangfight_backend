import { Request, Response, NextFunction } from "express";
import { Bettor, Poll, User } from "../models/beans.model.js";
import sanitizePoll, { sanitizePolls } from "../utils/sanitizePoll.js";
import sanitizeUser from "../utils/sanitizeUser.js";
import { toPositiveInt } from "../utils/validate.js";
import { HOUSE_ID } from "../env.js";

// bets on this poll count as donations (see the tax collector)
const DONATION_POLL_ID = "680685bfac986a4716b17a69";

// how many times each id appears, e.g. shares per bettor
const countEach = (ids: string[]): Map<string, number> => {
  const counts = new Map<string, number>();
  ids.forEach((id) => counts.set(id, (counts.get(id) || 0) + 1));
  return counts;
};

// Create a new poll
export const createPoll = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { creatorId, title, description, endDate, settleDate, options } =
      req.body;
    const seed = toPositiveInt(req.body.seed);
    const pricePerShare = toPositiveInt(req.body.pricePerShare);
    const betPerWager = req.body.betPerWager
      ? toPositiveInt(req.body.betPerWager)
      : undefined;

    if (!seed || !pricePerShare) {
      return res.status(400).json({
        message: "Seed and price per share must be positive whole numbers",
      });
    }

    if (!Array.isArray(options) || options.length < 2) {
      return res
        .status(400)
        .json({ message: "At least 2 options are required" });
    }

    if (options.length > 20) {
      return res.status(400).json({ message: "Maximum of 20 options allowed" });
    }

    if (betPerWager === null || (betPerWager && betPerWager < 2)) {
      return res.status(400).json({
        message: "Bet per wager must be at least 2",
      });
    }

    if (betPerWager && betPerWager > Math.floor(options.length / 2)) {
      return res.status(400).json({
        message: "Bet per wager cannot exceed half the number of options",
      });
    }

    if (seed < pricePerShare * (betPerWager || 1)) {
      return res.status(400).json({
        message: betPerWager
          ? "Seed must be at least the price per share times the bet per wager"
          : "Seed must be at least the price per share",
      });
    }

    const user = await User.findById(creatorId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role !== "admin") {
      const hasBookieLicense = user.inventory.some(
        (item) => item.name === "bookie license"
      );
      if (!hasBookieLicense) {
        return res
          .status(400)
          .json({ message: "User does not have a bookie license" });
      }

      if (user.beans < seed) {
        return res.status(400).json({ message: "Insufficient beans" });
      }

      if (user.role === "spectator" || user.role === "bettor" || !user.role) {
        user.role = "bookie";
      }
      user.beans -= seed;
      await user.save();
    }

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
        { contentType: "user" },
        { $push: { notifications: notification } }
      );
    }

    res.status(201).json({
      message: "Poll created successfully",
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

// Get all polls
export const getAllPolls = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.query;
    const polls = await Poll.find({ contentType: "poll" }).sort("endDate");
    res.json(await sanitizePolls(polls, userId as string));
  } catch (error) {
    next(error);
  }
};

// Get a specific poll by ID
export const getPollById = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.query;
    const { pollId } = req.params;

    if (!pollId) return res.status(400).json({ message: "Poll ID required" });
    if (!userId) return res.status(400).json({ message: "User ID required" });

    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    res.json(await sanitizePoll(poll, userId as string));
  } catch (error) {
    next(error);
  }
};

const isSettled = (poll: Poll) => poll.winners?.length > 0 || !!poll.winner;
const isIllegal = (poll: Poll) => poll.legalStatus?.isLegal === false;

// Get polls by type
export const getPollsByType = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.query;
    const { type } = req.params;
    const now = new Date();

    const filters: Record<string, (poll: Poll) => boolean> = {
      open: (poll) => !isSettled(poll) && poll.endDate > now,
      unsettled: (poll) =>
        !isSettled(poll) && !isIllegal(poll) && poll.endDate <= now,
      completed: (poll) => isSettled(poll) || isIllegal(poll),
    };

    const filter = filters[type];
    if (!filter) return res.status(400).json({ message: "Invalid poll type" });

    const polls = await Poll.find({ contentType: "poll" }).sort("endDate");
    res.json(await sanitizePolls(polls.filter(filter), userId as string));
  } catch (error) {
    next(error);
  }
};

// Place a bet (vote) on an option using optionId
export const placeBet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { pollId, optionId, userId, optionsArray } = req.body;
    const shares = toPositiveInt(req.body.shares);

    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    if (poll.endDate.getTime() < Date.now()) {
      return res.status(400).json({ message: "Poll has ended" });
    }

    if (!shares) {
      return res.status(400).json({ message: "Invalid number of shares" });
    }

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const error =
      poll.betPerWager && poll.betPerWager > 1
        ? placeMultipleBets(poll, user, optionsArray, shares)
        : placeSingleBet(poll, user, optionId, shares);
    if (error) return res.status(400).json({ message: error });

    await poll.save();
    await user.save();

    res.json({
      message: "Bet placed successfully",
      poll: await sanitizePoll(poll, userId),
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

// These apply the bet to the documents and return an error message if it can't be placed
const placeSingleBet = (
  poll: Poll,
  user: Bettor,
  optionId: string,
  shares: number
): string | null => {
  const option = poll.options.find((opt) => opt._id.toString() === optionId);
  if (!option) return "Option not found";

  const totalCost = poll.pricePerShare * shares;
  if (user.beans < totalCost) return "Insufficient beans";

  user.beans -= totalCost;
  poll.pot += totalCost;

  option.bettors.push(...Array(shares).fill(user._id.toString()));
  if (poll._id.toString() === DONATION_POLL_ID) {
    user.lastDonation = new Date();
  } else if (user.role === "spectator" || !user.role) user.role = "bettor";

  return null;
};

const placeMultipleBets = (
  poll: Poll,
  user: Bettor,
  optionsArray: string[],
  shares: number
): string | null => {
  if (!Array.isArray(optionsArray) || optionsArray.length === 0) {
    return "Invalid options array";
  }

  const betPerWager = poll.betPerWager!;
  if (optionsArray.length > betPerWager) return "Invalid number of options";

  const options = optionsArray.map((optionId) =>
    poll.options.find((opt) => opt._id.toString() === optionId)
  );
  if (options.some((opt) => !opt)) return "Option not found";

  const userId = user._id.toString();
  const existingBets = poll.options
    .filter((opt) => opt.bettors.includes(userId))
    .map((opt) => opt._id.toString());
  const newBets = optionsArray.filter((id) => !existingBets.includes(id));

  if (newBets.length + existingBets.length > betPerWager) {
    return "Exceeds maximum bets per wager";
  }

  const totalCost = optionsArray.length * poll.pricePerShare * shares;
  if (user.beans < totalCost) return "Insufficient beans";

  options.forEach((opt) => opt!.bettors.push(...Array(shares).fill(userId)));

  user.beans -= totalCost;
  poll.pot += totalCost;

  if (user.role === "spectator" || !user.role) user.role = "bettor";

  return null;
};

export const setPollWinner = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const { pollId, optionsArray }: { pollId: string; optionsArray?: string[] } =
      req.body;

    if (!Array.isArray(optionsArray) || !optionsArray.length) {
      return res.status(400).json({ message: "No winner provided" });
    }

    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });
    if (isSettled(poll)) {
      return res.status(400).json({ message: "Winner already set" });
    }
    if (isIllegal(poll)) {
      return res.status(400).json({ message: "Wager is illegal" });
    }

    const winningOptions = poll.options.filter((opt) =>
      optionsArray.includes(opt._id.toString())
    );
    if (winningOptions.length !== optionsArray.length) {
      return res.status(400).json({ message: "Invalid option IDs" });
    }

    poll.endDate = new Date();
    poll.settleDate = new Date();
    poll.winners = optionsArray;
    await poll.save(); // Save before payouts

    ///////////////////////////////////////////////////////
    // Payout logic

    let jackpot = poll.pot;
    const creator = await User.findById(poll.creatorId);
    if (creator) {
      const creatorPayout = Math.floor(jackpot * 0.05);
      creator.beans += creatorPayout;
      await creator.save();
      jackpot -= creatorPayout;
    }

    const totalVoters = poll.options.flatMap((opt) => opt.bettors);
    const totalWinners = winningOptions.flatMap((opt) => opt.bettors);

    if (totalWinners.length === totalVoters.length) {
      // every share was on a winner, so each bettor gets their shares back
      await Promise.all(
        [...countEach(totalVoters)].map(([voter, shares]) =>
          User.updateOne(
            { _id: voter },
            { $inc: { beans: shares * poll.pricePerShare } }
          )
        )
      );
      return res.json({ message: "All bettors refunded, no winner recorded" });
    }

    if (!totalWinners.length) {
      await User.findByIdAndUpdate(HOUSE_ID, { $inc: { beans: jackpot } });
      return res.json({
        message: "No correct votes, jackpot given to the house",
        user: creator && sanitizeUser(creator),
      });
    }

    // the jackpot is split evenly between winning options that had bets,
    // then by share within each option
    const optWithBets = winningOptions.filter((o) => o.bettors.length > 0);
    const beansPerOption = jackpot / optWithBets.length;
    const optionShares = optWithBets.map((o) => ({
      total: o.bettors.length,
      byVoter: countEach(o.bettors),
    }));

    await Promise.all(
      [...new Set(totalVoters)].map(async (voter) => {
        let payout = 0;
        for (const { total, byVoter } of optionShares) {
          payout += (beansPerOption * (byVoter.get(voter) || 0)) / total;
        }
        payout = Math.floor(payout);
        const isWinner = optionShares.some(({ byVoter }) => byVoter.has(voter));

        const user = await User.findById(voter);
        if (!user) return;
        if (isWinner) user.wins.push(poll._id);
        user.beans += payout;
        user.notifications.push({
          text: isWinner
            ? `Congratulations! You won ${payout.toLocaleString()} beans from the wager "${poll.title}".`
            : `Sorry! You lost the wager "${poll.title}". Never stop betting — your big win is coming!`,
        });
        await user.save();
      })
    );

    const updatedCreator = creator && (await User.findById(creator._id));

    res.json({
      message: "Winner set, creator paid, jackpot distributed",
      user: updatedCreator && sanitizeUser(updatedCreator),
    });
  } catch (error) {
    next(error);
  }
};
