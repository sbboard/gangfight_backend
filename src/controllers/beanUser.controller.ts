import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { InventoryItem, User } from "../models/beans.model.js";
import sanitizeUser from "../utils/sanitizeUser.js";
import { fileURLToPath } from "url";
import { dirname, join } from "path";
import fs from "fs";
import dotenv from "dotenv";
const __dirname = dirname(fileURLToPath(import.meta.url));
dotenv.config({ path: join(__dirname, "..", ".env") });

const HOUSE_ID = process.env.BEAN_HOUSE_ID;
const DUPE_ID = process.env.BEAN_DUPE_ID;

const getKey = (str: string): string => str.slice(-10);

export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, password, inviteCode, eye } = req.body;

    const existingUser = await User.findOne({
      $or: [{ name }, { displayName: name }],
    });

    if (existingUser) {
      return res.status(400).json({ message: "Username already taken" });
    }

    if (!inviteCode) {
      return res.status(400).json({ message: "Invite code required" });
    }

    const inviter = await User.findOne({
      "inventory.name": "invite",
      "inventory.meta": inviteCode,
    });

    const ignoreInviter = inviteCode === "PC98" || inviteCode === "pc98";

    if (!inviter && !ignoreInviter) {
      return res.status(404).json({ message: "Invalid invite code" });
    }

    if (inviter && !ignoreInviter) {
      inviter.inventory = inviter.inventory.filter(
        (item) => !(item.name === "invite" && item.meta === inviteCode)
      );

      inviter.notifications = inviter.notifications || [];
      inviter.notifications.push({
        text: `Your invite code was used by ${name}`,
      });

      await inviter.save();
    }
    const referrer = inviter?._id || HOUSE_ID;

    const hashedPassword = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");

    const user = new User({
      name,
      password: hashedPassword,
      wins: [],
      referrer,
      notifications: [
        {
          text: "Welcome to paradise! You have been gifted 10,000,000 beans to start betting.",
        },
      ],
    });

    if (eye) {
      user.inventory.push({
        name: "joes eye",
        meta: "",
      } as InventoryItem);
    }

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

    const user = await User.findOne({ name });
    if (!user) {
      return res.status(400).json({ message: "Invalid username or password" });
    }

    const hashedInputPassword = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");
    if (hashedInputPassword !== user.password) {
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

    if (user.password?.slice(-10) !== key) {
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
    const excludedUsers = [
      new mongoose.Types.ObjectId(HOUSE_ID),
      new mongoose.Types.ObjectId(DUPE_ID),
    ];

    const winners = await User.find({
      contentType: "user",
      _id: { $nin: excludedUsers },
    }).select("name displayName beans debt wins -_id");

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

    if (!fs.existsSync(filePath)) {
      res.status(404).json({ error: "Log file not found" });
      return;
    }

    const data = fs.readFileSync(filePath, "utf8");
    const jsonData = JSON.parse(data);

    res.json(jsonData);
  } catch (error) {
    next(error);
  }
};

export const updateUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    [
      "password",
      "contentType",
      "_id",
      "role",
      "beans",
      "wins",
      "inventory",
      "name",
      "penalties",
    ].forEach((field) => delete updateData[field]);

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
    const { id } = req.params;
    const user = await User.findById(id);

    if (!user) return res.status(404).json({ message: "User not found" });

    user.notificationsLastChecked = new Date();
    await user.save();

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
    const { userId, amount } = req.body;

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

    if (amount < 2_000_000 || amount > 50_000_000) {
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
    const { userId, amount } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.debt <= 0) {
      return res.status(400).json({ message: "User has no debt to pay off" });
    }

    if (user.beans < amount) {
      return res
        .status(400)
        .json({ message: "Not enough beans to pay off the debt" });
    }

    const payAmount = Math.min(amount, user.debt);

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

export const claimThursdayBonus = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const today = new Date();
    const lastBonusDate = user.lastBonusClaimed
      ? new Date(user.lastBonusClaimed)
      : null;

    //make sure it's been at least 5 days since the last bonus
    if (lastBonusDate) {
      const daysAgo = Math.floor(
        (today.getTime() - lastBonusDate.getTime()) / (1000 * 60 * 60 * 24)
      );
      if (daysAgo < 5) {
        return res.status(400).json({ message: "Too soon to claim!" });
      }
    }

    // Get beans from house account
    const houseAccount = await User.findById(HOUSE_ID);
    if (!houseAccount) {
      return res.status(500).json({ message: "House account not found" });
    }

    const bonusAmount = 5_000_000;

    if (houseAccount.beans < bonusAmount) {
      return res
        .status(400)
        .json({ message: "House account has insufficient beans" });
    }

    // Transfer beans from house to user
    houseAccount.beans -= bonusAmount;
    user.beans += bonusAmount;
    user.lastBonusClaimed = new Date();

    await Promise.all([houseAccount.save(), user.save()]);

    res.json({
      message: `Thursday bonus of ${bonusAmount.toLocaleString()} beans claimed successfully!`,
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
    const { id } = req.params;

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    user.notifications = [];
    await user.save();

    res.json({
      message: "Notifications cleared",
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};
