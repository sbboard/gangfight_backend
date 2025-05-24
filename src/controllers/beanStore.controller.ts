import { Request, Response, NextFunction } from "express";
import { User, Bettor, InventoryItem } from "../models/beans.model.js";
import { generateUniqueInviteCode } from "../utils/invite.js";
import { sanitizeUser } from "../utils/sanitizeUser.js";
import { ITEMS } from "../constants/items.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import dotenv from "dotenv";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const HOUSE_ID = process.env.BEAN_HOUSE_ID;

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
              user.displayName || user.name
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
      $or: [
        { name: recipientName.trim() },
        { displayName: recipientName.trim() },
      ],
    }).collation({ locale: "en", strength: 2 });

    if (!recipient)
      return res.status(404).json({ message: "Recipient not found" });

    const item: Partial<InventoryItem> = {
      name: "bean bag",
      meta: sender.displayName || sender.name,
      specialPrice: amount,
      specialDescription: message,
    };

    sender.beans -= amount;
    recipient.inventory.push(item as InventoryItem);

    recipient.notifications = recipient.notifications || [];
    recipient.notifications.push({
      text: `${
        sender.displayName || sender.name
      } sent you ${amount.toLocaleString()} beans`,
    });

    await Promise.all([sender.save(), recipient.save()]);
    const senderData = await User.findById(userId).lean();
    if (!senderData) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "Beans transferred successfully",
      user: sanitizeUser(senderData),
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

    let itemValue: number = user.inventory[itemIndex].specialPrice || 0;

    //find value of item if not a bean bag
    if (!itemValue && itemName) {
      const item = ITEMS[itemName.toLowerCase()];
      if (!item) return res.status(400).json({ message: "Invalid item name" });
      if (itemIndex !== -1) {
        itemValue = item.maintainsValue ? item.price : item.price / 2;
      }
    }

    user.inventory.splice(itemIndex, 1);
    user.beans += Math.floor(itemValue);
    await user.save();

    res.json({ message: "Item sold", user: sanitizeUser(user) });
  } catch (error) {
    next(error);
  }
};
