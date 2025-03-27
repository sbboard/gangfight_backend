import { Request, Response, NextFunction } from "express";
import { Bettor, Poll, PollOption, User } from "../models/beans.model.js";
import sanitizePoll from "../utils/sanitizePoll.js";
import sanitizeUser from "../utils/sanitizeUser.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const HOUSE_ID = process.env.BEAN_HOUSE_ID;

// Create a new poll
export const createPoll = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
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

    if (betPerWager && betPerWager < 2) {
      return res.status(400).json({
        message: "Bet per wager must be at least 2",
      });
    }

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

    if (options.length > 20) {
      return res.status(400).json({ message: "Maximum of 20 options allowed" });
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

    if (user.role === "spectator" || user.role === "bettor" || !user.role) {
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
        { contentType: "user" },
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
export const getAllPolls = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.query;
    const polls = await Poll.find({ contentType: "poll" }).sort("endDate");

    const cleanedPolls = await Promise.all(
      polls.map((poll) => sanitizePoll(poll, userId as string))
    );

    res.json(cleanedPolls);
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

// Place a bet (vote) on an option using optionId
export const placeBet = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { pollId, optionId, userId, shares, optionsArray } = req.body;

    const poll = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    if (poll.endDate.getTime() < Date.now()) {
      return res.status(400).json({ message: "Poll has ended" });
    }

    if (!shares || shares < 1)
      return res.status(400).json({ message: "Invalid number of shares" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (poll.betPerWager && poll.betPerWager > 1) {
      await placeMultipleBets(poll, user, optionsArray, shares);
    } else {
      await placeSingleBet(poll, user, optionId, shares);
    }

    if (user.role === "spectator" || !user.role) user.role = "bettor";

    res.json({
      message: "Bet placed successfully",
      poll: await sanitizePoll(poll, userId as string),
      newBeanAmt: user.beans,
    });
  } catch (error) {
    next(error);
  }
};

const placeSingleBet = async (
  poll: Poll,
  user: Bettor,
  optionId: string,
  shares: number
) => {
  const option = poll.options.find((opt) => opt._id.toString() === optionId);
  if (!option) throw new Error("Invalid option ID");

  const totalCost = poll.pricePerShare * shares;
  if (user.beans < totalCost) {
    return { message: "Insufficient beans" };
  }

  user.beans -= totalCost;
  poll.pot += totalCost;

  option.bettors.push(...Array(shares).fill(user._id));

  await poll.save();
  await user.save();
};

const placeMultipleBets = async (
  poll: Poll,
  user: Bettor,
  optionsArray: string[],
  shares: number
) => {
  if (!Array.isArray(optionsArray) || optionsArray.length === 0) {
    throw new Error("Invalid options array");
  }

  if (poll.betPerWager && optionsArray.length > poll.betPerWager) {
    throw new Error("Invalid number of options");
  }

  const totalCost = optionsArray.length * poll.pricePerShare * shares;
  if (user.beans < totalCost) {
    return { message: "Insufficient beans" };
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

export const setPollWinner = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<Response | void> => {
  try {
    const {
      pollId,
      optionId,
      optionsArray,
    }: { pollId: string; optionId?: string; optionsArray?: string[] } =
      req.body;

    const poll = await Poll.findById(pollId);
    if (!poll || poll.winner) {
      return res
        .status(poll ? 400 : 404)
        .json({ message: poll ? "Winner already set" : "Poll not found" });
    }

    poll.settleDate = new Date();

    let winningOptionIds: string[] = [];

    //Find and set the winning option to poll object
    if (optionId) {
      const winningOption = poll.options.find(
        (opt) => opt._id.toString() === optionId
      );
      if (!winningOption) {
        return res.status(400).json({ message: "Invalid option ID" });
      }

      winningOptionIds = [optionId];
      poll.winner = optionId;
    } else if (optionsArray) {
      const realOptions = poll.options.filter((opt) =>
        optionsArray.includes(opt._id.toString())
      );
      if (realOptions.length !== optionsArray.length) {
        return res.status(400).json({ message: "Invalid option IDs" });
      }

      winningOptionIds = optionsArray;
      poll.winners = optionsArray;
    } else {
      return res.status(400).json({ message: "No winner provided" });
    }

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

    const winningOptions = poll.options.filter((opt) =>
      winningOptionIds.includes(opt._id.toString())
    );
    const totalVoters = poll.options.flatMap((opt) => opt.bettors);
    const totalWinners = winningOptions.flatMap((opt) => opt.bettors);

    if (totalWinners.length === totalVoters.length) {
      await User.updateMany(
        { _id: { $in: totalVoters } },
        { $inc: { beans: poll.pricePerShare } }
      );
      return res.json({ message: "All bettors refunded, no winner recorded" });
    }

    if (!totalWinners.length) {
      await User.findByIdAndUpdate(HOUSE_ID, { $inc: { beans: jackpot } });
      return res.json({
        message: "No correct votes, jackpot given to the house",
        user: creator,
      });
    }

    const uniqueVoters = new Set(totalVoters);

    await Promise.all(
      [...uniqueVoters].map(async (voter) => {
        const bookieTax = poll.pot * 0.05;
        let payout = poll.creatorId === voter ? bookieTax : 0;
        let isWinner = false;

        const optWithBets = winningOptions.filter((o) => o.bettors.length > 0);
        const beansPerBet = jackpot / optWithBets.length;

        optWithBets.forEach((o) => {
          const ts = o.bettors.length;
          const yourPercent = o.bettors.filter((i) => i === voter).length / ts;
          if (yourPercent > 0) isWinner = true;
          payout += beansPerBet * yourPercent;
        });

        const user = await User.findById(voter);
        if (user) {
          if (isWinner) user.wins.push(poll._id);
          user.beans += Math.floor(payout);
          user.notifications.push({
            text: isWinner
              ? `Congratulations! You won ${payout.toLocaleString()} from the wager "${
                  poll.title
                }".`
              : `Sorry! You lost the wager "${poll.title}". Never stop betting — your big win is coming!`,
          });
          await user.save();
        }
      })
    );

    const updatedCreator = await User.findById(creator?._id);

    res.json({
      message: "Winner set, creator paid, jackpot distributed",
      user: sanitizeUser(updatedCreator!),
    });
  } catch (error) {
    next(error);
  }
};
