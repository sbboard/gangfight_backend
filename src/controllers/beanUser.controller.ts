import { Request, Response, NextFunction } from "express";
import crypto from "crypto";
import mongoose from "mongoose";
import { User } from "../models/beans.model.js";
import sanitizeUser from "../utils/sanitizeUser.js";
import dotenv from "dotenv";
dotenv.config();

const HOUSE_ID = process.env.HOUSE_ID;
const DUPE_ID = process.env.DUPE_ID;

const getKey = (str: string): string => str.slice(-10);

export const registerUser = async (
  req: Request,
  res: Response,
  next: NextFunction
) => {
  try {
    const { name, password, inviteCode } = req.body;

    const existingUser = await User.findOne({ name });
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

    if (!inviter) {
      return res.status(404).json({ message: "Invalid invite code" });
    }

    inviter.inventory = inviter.inventory.filter(
      (item) => !(item.name === "invite" && item.meta === inviteCode)
    );

    inviter.notifications = inviter.notifications || [];
    inviter.notifications.push({
      text: `Your invite code was used by ${name}`,
    });

    await inviter.save();
    const referrer = inviter._id;

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
          text: "Welcome to the game! You have been gifted 10,000,000 beans to start betting.",
        },
      ],
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
    }).select("name beans debt wins -_id");

    winners.sort((a, b) => b.beans - b.debt - (a.beans - a.debt));

    res.json(winners);
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
