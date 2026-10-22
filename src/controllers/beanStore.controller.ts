import { Request, Response, NextFunction } from "express";
import { User, InventoryItem } from "../models/beans.model.js";
import { generateUniqueInviteCode } from "../utils/invite.js";
import { sanitizeUser } from "../utils/sanitizeUser.js";
import { hasValidKey } from "../utils/auth.js";
import { toPositiveInt } from "../utils/validate.js";
import { ITEMS } from "../constants/items.js";
import { HOUSE_ID } from "../env.js";

const LOTTO_PRICE = 10_000;
const LOTTO_ODDS = 1 / 100000;
const LOTTO_RESET = 10_000_000;
const MIN_TRANSFER = 500_000;

export const runLottery = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.body;
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.beans < LOTTO_PRICE) {
      return res
        .status(400)
        .json({ message: "Not enough beans to participate" });
    }

    const house = await User.findById(HOUSE_ID);
    if (!house)
      return res.status(404).json({ message: "Lottery account not found" });

    user.beans -= LOTTO_PRICE;

    let message: string;
    if (Math.random() < LOTTO_ODDS) {
      const wonBeans = house.beans;
      user.beans += wonBeans;
      house.beans = LOTTO_RESET;
      await Promise.all([house.save(), user.save()]);
      message = `Congratulations! You won ${wonBeans.toLocaleString()} beans!`;

      await User.updateMany(
        { contentType: "user" },
        {
          $push: {
            notifications: {
              text: `${
                user.displayName || user.name
              } won the lottery! The jackpot was ${wonBeans.toLocaleString()}.`,
            },
          },
        }
      );
    } else {
      house.beans += LOTTO_PRICE;
      await Promise.all([house.save(), user.save()]);
      message = "Better luck next time!";
    }

    res.json({
      message,
      user: sanitizeUser(user),
      houseBeans: house.beans,
    });
  } catch (error) {
    next(error);
  }
};

export const getJackpot = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const house = await User.findById(HOUSE_ID).select("beans").lean();
    if (!house)
      return res.status(404).json({ message: "House account not found" });

    res.json({ jackpot: house.beans ?? 0 });
  } catch (error) {
    next(error);
  }
};

export const buyItem = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.body;
    const itemName = String(req.body.itemName ?? "").toLowerCase();
    const item = ITEMS[itemName];
    if (!item) return res.status(400).json({ message: "Invalid item" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.role === "racketeer" && itemName === "bookie license") {
      return res
        .status(400)
        .json({ message: "You can't buy a bookie license" });
    }

    if (user.debt > 0) {
      return res
        .status(400)
        .json({ message: "You can't buy items while in debt" });
    }

    if (user.beans < item.price) {
      return res.status(400).json({ message: "Not enough beans" });
    }

    const meta =
      itemName === "invite"
        ? await generateUniqueInviteCode()
        : item.generateMeta();

    user.beans -= item.price;
    user.inventory.push({ name: itemName, meta } as InventoryItem);
    await user.save();

    res.json({ message: "Item purchased", user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};

export const sendBeans = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId, userKey, recipientName, message } = req.body;
    const amount = toPositiveInt(req.body.amount);

    const sender = await User.findById(userId);
    if (!sender) return res.status(404).json({ message: "User not found" });

    if (!hasValidKey(sender, userKey)) {
      return res.status(403).json({ message: "Invalid key" });
    }

    if (sender.debt > 0) {
      return res
        .status(400)
        .json({ message: "You can't transfer beans while in debt" });
    }

    if (!amount || amount < MIN_TRANSFER) {
      return res
        .status(400)
        .json({ message: "Minimum transfer amount is 500,000 beans" });
    }

    if (sender.beans < amount) {
      return res.status(400).json({ message: "Not enough beans" });
    }

    const name = String(recipientName ?? "").trim();
    const recipient = await User.findOne({
      contentType: "user",
      $or: [{ name }, { displayName: name }],
    }).collation({ locale: "en", strength: 2 });

    if (!recipient)
      return res.status(404).json({ message: "Recipient not found" });

    const senderName = sender.displayName || sender.name;
    recipient.inventory.push({
      name: "bean bag",
      meta: senderName,
      specialPrice: amount,
      specialDescription: message,
    } as InventoryItem);
    recipient.notifications.push({
      text: `${senderName} sent you ${amount.toLocaleString()} beans`,
    });
    await recipient.save();

    // reload rather than save, in case the sender is also the recipient
    const updatedSender = await User.findByIdAndUpdate(
      userId,
      { $inc: { beans: -amount } },
      { new: true }
    );

    res.json({
      message: "Beans transferred successfully",
      user: updatedSender && sanitizeUser(updatedSender),
    });
  } catch (error) {
    next(error);
  }
};

export const sellItem = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId, itemName, itemId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.inventory.length === 0) {
      return res.status(400).json({ message: "User has no items to sell" });
    }

    const itemIndex = user.inventory.findIndex(
      (i: InventoryItem) =>
        (itemId && i._id?.toString() === itemId) ||
        (itemName && i.name.toLowerCase() === itemName.toLowerCase())
    );

    if (itemIndex === -1) {
      return res.status(400).json({ message: "Item not found in inventory" });
    }

    const owned = user.inventory[itemIndex];
    let itemValue = owned.specialPrice || 0;

    //find value of item if not a bean bag
    if (!itemValue) {
      const item = ITEMS[owned.name.toLowerCase()];
      if (!item) return res.status(400).json({ message: "Invalid item name" });
      itemValue = item.maintainsValue ? item.price : item.price / 2;
    }

    user.inventory.splice(itemIndex, 1);
    user.beans += Math.floor(itemValue);
    await user.save();

    res.json({ message: "Item sold", user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};
