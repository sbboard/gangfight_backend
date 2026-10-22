import { Request, Response, NextFunction } from "express";
import mongoose from "mongoose";
import { InventoryItem, User } from "../models/beans.model.js";
import sanitizeUser from "../utils/sanitizeUser.js";
import { getKey, hasValidKey, hashPassword } from "../utils/auth.js";
import { toPositiveInt } from "../utils/validate.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs/promises";
import { HOUSE_ID, DUPE_ID } from "../env.js";
const __dirname = dirname(fileURLToPath(import.meta.url));

const isNameTaken = (name: string, exceptId?: string) =>
  User.exists({
    ...(exceptId && { _id: { $ne: exceptId } }),
    $or: [{ name }, { displayName: name }],
  });

export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { inviteCode, eye, promoCode, password } = req.body;
    const name = typeof req.body.name === "string" ? req.body.name.trim() : "";

    if (!name || typeof password !== "string" || !password) {
      return res
        .status(400)
        .json({ message: "Username and password required" });
    }

    if (await isNameTaken(name)) {
      return res.status(400).json({ message: "Username already taken" });
    }

    if (!inviteCode) {
      return res.status(400).json({ message: "Invite code required" });
    }

    const ignoreInviter = String(inviteCode).toUpperCase() === "PC98";
    const inviter = ignoreInviter
      ? null
      : await User.findOne({
          "inventory.name": "invite",
          "inventory.meta": inviteCode,
        });

    if (!inviter && !ignoreInviter) {
      return res.status(404).json({ message: "Invalid invite code" });
    }

    if (inviter) {
      inviter.inventory = inviter.inventory.filter(
        (item) => !(item.name === "invite" && item.meta === inviteCode)
      );
      inviter.notifications.push({
        text: `Your invite code was used by ${name}`,
      });
      await inviter.save();
    }
    const referrer = inviter?._id || HOUSE_ID;

    const hashedPassword = hashPassword(password);

    let text = "Welcome to paradise!";
    text += " You have been gifted 10,000,000 beans to start betting.";
    let beans = 10_000_000;

    const inventory = [] as InventoryItem[];
    if (promoCode === "PIMPMYBEANS") {
      beans += 50_000_000;
      text = "Welcome to paradise, fellow pimp. Enjoy 50 mill on the house.";
    } else if (
      promoCode === "COOL" ||
      promoCode === "FUCK" ||
      promoCode === "BOOBS"
    ) {
      beans = 7_500_000;
      text = "You come in here acting like a cool guy?";
      text += " FUCK YOU!";
      text += " Normally people start with 10 million beans,";
      text += " but you're only getting 7.5 million.";
      text += " Maybe humble yourself before you strut around here.";
    }

    if (eye) {
      inventory.push({
        name: "joes eye",
        meta: "",
      } as InventoryItem);
      text += " (You can hear a man named Joey screaming in the distance.)";
    }

    const user = new User({
      name,
      beans,
      password: hashedPassword,
      wins: [],
      referrer,
      inventory,
      notifications: [{ text }],
    });

    await user.save();
    res.status(201).json({
      message: "User registered successfully",
      user: sanitizeUser(user),
      key: getKey(hashedPassword),
    });
  } catch (error) {
    next(error);
  }
};

export const loginUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, password } = req.body;
    if (typeof password !== "string") {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    const user = await User.findOne({ name });
    const hashedInputPassword = hashPassword(password);
    if (!user || hashedInputPassword !== user.password) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    res.json({
      message: "Login successful",
      user: sanitizeUser(user),
      key: getKey(hashedInputPassword),
    });
  } catch (error) {
    next(error);
  }
};

export const getUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id, key } = req.params;

    if (!id) return res.status(400).json({ message: "Missing id" });
    if (!key) return res.status(400).json({ message: "Missing key" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (!hasValidKey(user, key)) {
      return res.status(403).json({ message: "Invalid key" });
    }

    res.status(200).json(sanitizeUser(user));
  } catch (error) {
    next(error);
  }
};

export const getWinners = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const excludedUsers = [HOUSE_ID, DUPE_ID]
      .filter((id) => mongoose.isValidObjectId(id))
      .map((id) => new mongoose.Types.ObjectId(id));

    const winners = await User.find({
      contentType: "user",
      _id: { $nin: excludedUsers },
    })
      .select("name displayName beans debt wins -_id")
      .lean();

    winners.sort((a, b) => b.beans - b.debt - (a.beans - a.debt));

    // Use displayName if available, otherwise use name
    const processedWinners = winners.map((winner) => ({
      name: winner.displayName || winner.name,
      beans: winner.beans,
      debt: winner.debt,
      wins: winner.wins,
    }));

    res.json(processedWinners);
  } catch (error) {
    next(error);
  }
};

export const getTopTenLog = async (
  req: Request,
  res: Response,
  next: NextFunction
): Promise<void> => {
  try {
    const filePath = join(__dirname, "..", "topTenLog.json");
    const data = await fs.readFile(filePath, "utf8").catch(() => null);

    if (data === null) {
      res.status(404).json({ error: "Log file not found" });
      return;
    }

    res.json(JSON.parse(data));
  } catch (error) {
    next(error);
  }
};

// fields clients may not set through the generic update
const PROTECTED_FIELDS = [
  "password",
  "contentType",
  "_id",
  "__v",
  "role",
  "beans",
  "debt",
  "wins",
  "inventory",
  "name",
  "penalties",
  "referrer",
  "registrationDate",
  "lastBonusClaimed",
  "lastDonation",
];

export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };
    PROTECTED_FIELDS.forEach((field) => delete updateData[field]);

    if ("displayName" in updateData) {
      const displayName = String(updateData.displayName ?? "").trim();
      if (!displayName) {
        return res.status(400).json({ message: "Display name required" });
      }
      if (await isNameTaken(displayName, id)) {
        return res.status(400).json({ message: "Username already taken" });
      }
      updateData.displayName = displayName;
    }

    const user = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    });

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "User updated successfully",
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export const updateNotification = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { notificationsLastChecked: new Date() },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "Last notification check updated",
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export const requestDebt = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.body;
    const amount = toPositiveInt(req.body.amount);

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.beans >= 2_000_000) {
      return res
        .status(400)
        .json({ message: "User has enough beans to not be eligible for debt" });
    }

    if (user.debt > 0) {
      return res.status(400).json({ message: "User already has a debt" });
    }

    if (user.inventory.length > 0) {
      return res.status(400).json({
        message:
          "User cannot request debt if they have items in their inventory",
      });
    }

    if (!amount || amount < 2_000_000 || amount > 50_000_000) {
      return res.status(400).json({
        message: "Requested amount must be between 2,000,000 and 50,000,000",
      });
    }

    const debtWithFee = Math.floor(amount * 1.2);

    user.debt += debtWithFee;
    user.beans += amount;

    await user.save();

    res.json({
      message: `Debt of ${amount} requested successfully. Total debt with 20% fee: ${debtWithFee}`,
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export const payOffDebt = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.body;
    const amount = toPositiveInt(req.body.amount);
    if (!amount) return res.status(400).json({ message: "Invalid amount" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.debt <= 0) {
      return res.status(400).json({ message: "User has no debt to pay off" });
    }

    const payAmount = Math.min(amount, user.debt);

    if (user.beans < payAmount) {
      return res
        .status(400)
        .json({ message: "Not enough beans to pay off the debt" });
    }

    user.beans -= payAmount;
    user.debt -= payAmount;

    await user.save();

    res.json({
      message: `Successfully paid off ${payAmount} of the debt. Remaining debt: ${user.debt}`,
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

const BONUS_AMOUNT = 5_000_000;
const BONUS_COOLDOWN_DAYS = 5;

export const claimThursdayBonus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.lastBonusClaimed) {
      const daysAgo =
        (Date.now() - user.lastBonusClaimed.getTime()) / (1000 * 60 * 60 * 24);
      if (daysAgo < BONUS_COOLDOWN_DAYS) {
        return res.status(400).json({ message: "Too soon to claim!" });
      }
    }

    // Get beans from house account
    const houseAccount = await User.findById(HOUSE_ID);
    if (!houseAccount) {
      return res.status(500).json({ message: "House account not found" });
    }

    if (houseAccount.beans < BONUS_AMOUNT) {
      return res
        .status(400)
        .json({ message: "House account has insufficient beans" });
    }

    houseAccount.beans -= BONUS_AMOUNT;
    user.beans += BONUS_AMOUNT;
    user.lastBonusClaimed = new Date();

    await Promise.all([houseAccount.save(), user.save()]);

    res.json({
      message: `Thursday bonus of ${BONUS_AMOUNT.toLocaleString()} beans claimed successfully!`,
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

export const clearNotifications = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const user = await User.findByIdAndUpdate(
      req.params.id,
      { notifications: [] },
      { new: true }
    );
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({
      message: "Notifications cleared",
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};
