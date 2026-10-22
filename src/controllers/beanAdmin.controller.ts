import { Request, Response, NextFunction } from "express";
import { Bettor, InventoryItem, Poll, User } from "../models/beans.model.js";
import { generateUniqueInviteCode } from "../utils/invite.js";
import { verifyAdmin } from "../utils/auth.js";
import { HOUSE_ID } from "../env.js";

export const refundWager = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { pollId, userId, userKey } = req.body;

    const { status, message } = await verifyAdmin(userId, userKey);
    if (status) return res.status(status).json({ message });

    const poll: Poll | null = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });
    if (poll.winners.length || poll.winner) {
      return res
        .status(400)
        .json({ message: "Wager already settled, winnings were paid out" });
    }

    const userRefunds = new Map<string, number>();
    poll.options.forEach((option) => {
      option.bettors.forEach((bettorId) => {
        userRefunds.set(
          bettorId,
          (userRefunds.get(bettorId) || 0) + poll.pricePerShare
        );
      });
    });

    await Promise.all(
      Array.from(userRefunds.entries()).map(([bettorId, refundAmt]) =>
        User.findByIdAndUpdate(bettorId, {
          $inc: { beans: refundAmt },
          $push: {
            notifications: {
              text: `The wager "${
                poll.title
              }" has been refunded. The ${refundAmt.toLocaleString()} beans you bet have been returned.`,
            },
          },
        })
      )
    );

    const creator: Bettor | null = await User.findById(poll.creatorId);
    if (creator) {
      creator.beans += poll.seed / 2;
      creator.notifications.push({
        text: `Your wager "${
          poll.title
        }" has been refunded. Your initial seed of ${(
          poll.seed / 2
        ).toLocaleString()} beans has been returned.`,
      });
      await creator.save();
    }

    await Poll.findByIdAndDelete(pollId);

    res.json({ message: "All bets refunded, wager deleted" });
  } catch (error) {
    next(error);
  }
};

export const makeWagerIllegal = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { pollId, userId, userKey } = req.body;

    const { status, message } = await verifyAdmin(userId, userKey);
    if (status) return res.status(status).json({ message });

    const poll: Poll | null = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    if (!poll.legalStatus.isLegal)
      return res.status(400).json({ message: "Wager already illegal" });
    if (poll.winners.length || poll.winner)
      return res.status(400).json({ message: "Wager already settled" });
    if (poll.endDate.getTime() < Date.now())
      return res.status(400).json({ message: "Wager already ended" });

    const creator: Bettor | null = await User.findById(poll.creatorId);
    if (!creator) return res.status(404).json({ message: "Creator not found" });

    const lawsBroken = String(req.body.lawsBroken ?? "")
      .split(",")
      .map((law) => law.trim())
      .filter(Boolean);

    poll.endDate = new Date();
    poll.settleDate = new Date();
    poll.legalStatus = { isLegal: false, lawsBroken };
    await poll.save();

    await User.updateMany(
      { _id: { $in: poll.options.flatMap((opt) => opt.bettors) } },
      {
        $push: {
          notifications: {
            text: `ALERT: You are a victim! You bet in the wager "${poll.title}" which was found to be illegal.`,
          },
        },
      }
    );

    creator.penalties = (creator.penalties || 0) + 1;
    if (creator.penalties >= 3) creator.role = "racketeer";

    creator.inventory = creator.inventory.filter(
      (item) => item.name !== "bookie license"
    );

    creator.notifications.push({
      text: `Your wager "${
        poll.title
      }" was found to be illegal. Laws broken: ${lawsBroken.join(
        ", "
      )}. You successfully stole ${poll.pot.toLocaleString()} beans.`,
    });

    creator.beans += poll.pot;
    await creator.save();

    res.json({ message: "Bet made illegal" });
  } catch (error) {
    next(error);
  }
};

export const sendMassNotification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId, userKey, message: text } = req.body;

    const { status, message } = await verifyAdmin(userId, userKey);
    if (status) return res.status(status).json({ message });

    const { matchedCount } = await User.updateMany(
      { contentType: "user" },
      { $push: { notifications: { text } } }
    );
    if (!matchedCount)
      return res.status(404).json({ message: "No users found" });

    res.json({ message: "Message sent to all users" });
  } catch (error) {
    next(error);
  }
};

const houseInvites = (house: Bettor) =>
  house.inventory.filter((item) => item.name === "invite");

export const createHouseInvite = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId, userKey } = req.body;

    const { status, message } = await verifyAdmin(userId, userKey);
    if (status) return res.status(status).json({ message });

    const house: Bettor | null = await User.findById(HOUSE_ID);
    if (!house)
      return res.status(404).json({ message: "House account not found" });

    const inviteCode = await generateUniqueInviteCode();
    house.inventory.push({ name: "invite", meta: inviteCode } as InventoryItem);
    await house.save();

    res.json({ message: "Invite created", invites: houseInvites(house) });
  } catch (error) {
    next(error);
  }
};

export const getHouseInvites = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId, userKey } = req.query;

    const { status, message } = await verifyAdmin(userId, userKey);
    if (status) return res.status(status).json({ message });

    const house: Bettor | null = await User.findById(HOUSE_ID);
    if (!house)
      return res.status(404).json({ message: "House account not found" });

    res.json({ invites: houseInvites(house) });
  } catch (error) {
    next(error);
  }
};
