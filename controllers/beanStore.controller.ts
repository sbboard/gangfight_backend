import { Request, Response, NextFunction } from "express";
import { User, Bettor, InventoryItem } from "../models/beans.model";
import { generateUniqueInviteCode } from "../utils/invite";
import { sanitizeUser } from "../utils/sanitizeUser";
import { ITEMS } from "../constants/items";
import dotenv from "dotenv";
dotenv.config();

const HOUSE_ID = process.env.HOUSE_ID;

const LOTTO_PRICE = 10_000;

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

    user.beans -= LOTTO_PRICE;
    await user.save();

    const isWinner = Math.random() < 1 / 100000;
    let house = await User.findById(HOUSE_ID);
    if (!house)
      return res.status(404).json({ message: "Lottery account not found" });

    let message: string;
    let wonBeans = 0;

    if (isWinner) {
      wonBeans = house.beans;
      user.beans += wonBeans;
      house.beans = 10_000_000;
      await Promise.all([house.save(), user.save()]);
      message = `Congratulations! You won ${wonBeans} beans!`;

      const users = await User.find({ contentType: "user" });
      await Promise.all(
        users.map(async (u: Bettor) => {
          u.notifications = u.notifications || [];
          u.notifications.push({
            text: `${
              user.name
            } won the lottery! The jackpot was ${wonBeans.toLocaleString()}.`,
          });
          await u.save();
        })
      );
    } else {
      house.beans += LOTTO_PRICE;
      await house.save();
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
    const house = await User.findById(HOUSE_ID);
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
    const { userId, itemName } = req.body;
    const item = ITEMS[itemName.toLowerCase()];
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
      itemName.toLowerCase() === "invite"
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
    const { userId, userKey, recipientName, message, amount } = req.body;

    let sender = await User.findById(userId);
    if (!sender) return res.status(404).json({ message: "User not found" });

    if (sender.password?.slice(-10) !== userKey) {
      return res.status(403).json({ message: "Invalid key" });
    }

    if (sender.debt > 0) {
      return res
        .status(400)
        .json({ message: "You can't transfer beans while in debt" });
    }

    if (sender.beans < amount) {
      return res.status(400).json({ message: "Not enough beans" });
    }

    if (amount < 500_000) {
      return res
        .status(400)
        .json({ message: "Minimum transfer amount is 500,000 beans" });
    }

    const recipient = await User.findOne({
      contentType: "user",
      name: recipientName.trim(),
    }).collation({ locale: "en", strength: 2 });

    if (!recipient)
      return res.status(404).json({ message: "Recipient not found" });

    const item: Partial<InventoryItem> = {
      name: "bean bag",
      meta: sender.name,
      specialPrice: amount,
      specialDescription: message,
    };

    sender.beans -= amount;
    recipient.inventory.push(item as InventoryItem);

    recipient.notifications = recipient.notifications || [];
    recipient.notifications.push({
      text: `${sender.name} sent you ${amount.toLocaleString()} beans`,
    });

    await Promise.all([sender.save(), recipient.save()]);
    sender = await User.findById(userId).lean();

    if (!sender) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "Beans transferred successfully",
      user: sanitizeUser(sender),
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

    let itemValue: number = 0;
    let itemIndex = user.inventory.findIndex(
      (i: InventoryItem) => i._id == itemId
    );

    if (itemIndex !== -1) {
      itemValue = user.inventory[itemIndex].specialPrice || 0;
    }

    if (itemValue === null && itemName) {
      const item = ITEMS[itemName.toLowerCase()];
      if (!item) return res.status(400).json({ message: "Invalid item name" });

      itemIndex = user.inventory.findIndex(
        (i: InventoryItem) => i.name.toLowerCase() === itemName.toLowerCase()
      );
      if (itemIndex !== -1) {
        itemValue = item.maintainsValue ? item.price : item.price / 2;
      }
    }

    if (itemIndex === -1)
      return res.status(400).json({ message: "Item not found in inventory" });

    user.inventory.splice(itemIndex, 1);
    user.beans += Math.floor(itemValue);
    await user.save();

    res.json({ message: "Item sold", user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};
