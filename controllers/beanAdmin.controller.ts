import { Request, Response, NextFunction } from "express";
import { Bettor, InventoryItem, Poll, User } from "../models/beans.model.js";
import { generateUniqueInviteCode } from "../utils/invite.js";

const HOUSE_ID = "house_account_id"; // Replace with actual house account ID

export const refundWager = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { pollId, userId, userKey } = req.body;

    const user: Bettor | null = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "admin")
      return res.status(403).json({ message: "User is not an admin" });
    if (user.password?.slice(-10) !== userKey)
      return res.status(403).json({ message: "Invalid key" });

    const poll: Poll | null = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

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
      Array.from(userRefunds.entries()).map(async ([bettorId, refundAmt]) => {
        await User.findByIdAndUpdate(bettorId, {
          $inc: { beans: refundAmt },
          $push: {
            notifications: {
              text: `The wager "${
                poll.title
              }" has been refunded. The ${refundAmt.toLocaleString()} beans you bet have been returned.`,
            },
          },
        });
      })
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
    const { pollId, userId, userKey, lawsBroken } = req.body;

    const user: Bettor | null = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "admin")
      return res.status(403).json({ message: "User is not an admin" });
    if (user.password?.slice(-10) !== userKey)
      return res.status(403).json({ message: "Invalid key" });

    const poll: Poll | null = await Poll.findById(pollId);
    if (!poll) return res.status(404).json({ message: "Poll not found" });

    if (!poll.legalStatus.isLegal)
      return res.status(400).json({ message: "Wager already illegal" });
    if (poll.winner)
      return res.status(400).json({ message: "Wager already settled" });
    if (poll.endDate.getTime() < Date.now())
      return res.status(400).json({ message: "Wager already ended" });

    poll.endDate = new Date();
    poll.settleDate = new Date();
    poll.legalStatus = {
      isLegal: false,
      lawsBroken: lawsBroken.split(",").map((law: string) => law.trim()),
    };
    await poll.save();

    const creator: Bettor | null = await User.findById(poll.creatorId);
    if (!creator) return res.status(404).json({ message: "Creator not found" });

    const notification = {
      text: `ALERT: You are a victim! You bet in the wager "${poll.title}" which was found to be illegal.`,
    };

    await User.updateMany(
      { _id: { $in: poll.options.flatMap((opt) => opt.bettors) } },
      { $push: { notifications: notification } }
    );

    creator.penalties = (creator.penalties || 0) + 1;
    if (creator.penalties >= 3) creator.role = "racketeer";

    creator.inventory = creator.inventory.filter(
      (item) => item.name !== "bookie license"
    );

    creator.notifications.push({
      text: `Your wager "${
        poll.title
      }" was found to be illegal. Laws broken: ${lawsBroken}. You successfully stole ${poll.pot.toLocaleString()} beans.`,
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
    const { userId, userKey, message } = req.body;

    const user: Bettor | null = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "admin")
      return res.status(403).json({ message: "User is not an admin" });
    if (user.password?.slice(-10) !== userKey)
      return res.status(403).json({ message: "Invalid key" });

    const users: Bettor[] = await User.find({ contentType: "user" });
    if (!users.length)
      return res.status(404).json({ message: "No users found" });

    await Promise.all(
      users.map(async (u) => {
        u.notifications.push({ text: message });
        await u.save();
      })
    );

    res.json({ message: "Message sent to all users" });
  } catch (error) {
    next(error);
  }
};

export const createHouseInvite = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId, userKey } = req.body;

    const user: Bettor | null = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "admin")
      return res.status(403).json({ message: "User is not an admin" });
    if (user.password?.slice(-10) !== userKey)
      return res.status(403).json({ message: "Invalid key" });

    const house: Bettor | null = await User.findById(HOUSE_ID);
    if (!house)
      return res.status(404).json({ message: "House account not found" });

    const inviteCode = await generateUniqueInviteCode();
    house.inventory.push({ name: "invite", meta: inviteCode } as InventoryItem);
    await house.save();

    const invites = house.inventory.filter((item) => item.name === "invite");

    res.json({ message: "Invite created", invites });
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
    const { userId, userKey } = req.query as {
      userId: string;
      userKey: string;
    };

    const user: Bettor | null = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });
    if (user.role !== "admin")
      return res.status(403).json({ message: "User is not an admin" });
    if (user.password?.slice(-10) !== userKey)
      return res.status(403).json({ message: "Invalid key" });

    const house: Bettor | null = await User.findById(HOUSE_ID);
    if (!house)
      return res.status(404).json({ message: "House account not found" });

    const invites = house.inventory.filter((item) => item.name === "invite");

    res.json({ invites });
  } catch (error) {
    next(error);
  }
};
