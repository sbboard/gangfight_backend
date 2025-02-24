const { User } = require("../models/beans.model.js");
const crypto = require("crypto");
const mongoose = require("mongoose");

// Register a new user
exports.registerUser = async (req, res, next) => {
  try {
    const { name, password, inviteCode } = req.body;

    // Check if user already exists
    const existingUser = await User.findOne({ name });
    if (existingUser) {
      return res.status(400).json({ message: "Username already taken" });
    }

    let referrer = null;
    if (!inviteCode) {
      return res.status(400).json({ message: "Invite code required" });
    }
    // Find user with the invite
    const inviter = await User.findOne({
      "inventory.name": "invite",
      "inventory.meta": inviteCode,
    });

    if (!inviter) {
      return res.status(404).json({ message: "Invalid invite code" });
    }

    // Remove invite from inviter's inventory
    inviter.inventory = inviter.inventory.filter(
      (item) => !(item.name === "invite" && item.meta === inviteCode)
    );
    await inviter.save();
    referrer = inviter._id;

    // Hash the password using crypto
    const hashedPassword = crypto
      .createHash("sha256")
      .update(password)
      .digest("hex");

    // Create a new user
    const user = new User({
      name,
      password: hashedPassword,
      wins: [],
      referrer,
    });

    await user.save();
    res.status(201).json({ message: "User registered successfully", user });
  } catch (error) {
    next(error);
  }
};

// Login a user
exports.loginUser = async (req, res, next) => {
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

    res.json({ message: "Login successful", user });
  } catch (error) {
    next(error);
  }
};

// Get user details
exports.getUser = async (req, res, next) => {
  try {
    const user = await User.findById(req.params.id).select("-password");
    if (!user) return res.status(404).json({ message: "User not found" });

    res.json(user);
  } catch (error) {
    next(error);
  }
};

exports.getWinners = async (req, res, next) => {
  try {
    const excludedUsers = [
      new mongoose.Types.ObjectId("67bbdee28094dd05bc218d1d"), // the house
      new mongoose.Types.ObjectId("67b7d251d82f7305bc9b3425"), // dupe
    ];

    const winners = await User.find({
      contentType: "user",
      _id: { $nin: excludedUsers }, // Exclude specific users
      role: { $ne: "banned" }, // Exclude banned users
    }).select("name beans debt wins");

    // Sort by beans - debt in descending order
    winners.sort((a, b) => b.beans - b.debt - (a.beans - a.debt));

    res.json(winners);
  } catch (error) {
    next(error);
  }
};

// Update user information
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    delete updateData.password;
    delete updateData.contentType;

    const user = await User.findByIdAndUpdate(id, updateData, {
      new: true,
      runValidators: true,
    }).select("-password");

    if (!user) return res.status(404).json({ message: "User not found" });

    res.json({ message: "User updated successfully", user });
  } catch (error) {
    next(error);
  }
};

// STORE

const ITEMS = {
  invite: {
    price: 25000000,
    generateMeta: () =>
      Math.random().toString(36).substring(2, 7).toUpperCase(),
  },
  "bookie license": { price: 10000000, generateMeta: () => "" },
  adblock: { price: 5000000, generateMeta: () => "" },
};

exports.buyItem = async (req, res, next) => {
  try {
    const { userId, itemName } = req.body;
    const item = ITEMS[itemName.toLowerCase()];
    if (!item) return res.status(400).json({ message: "Invalid item" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    if (user.debt > 0)
      return res
        .status(400)
        .json({ message: "You can't buy items while in debt" });

    if (user.beans < item.price)
      return res.status(400).json({ message: "Not enough beans" });

    const house = await User.findById(HOUSE_ID);
    if (!house) {
      return res.status(404).json({ message: "Lottery account not found" });
    }

    user.beans -= item.price;
    user.inventory.push({ name: itemName, meta: item.generateMeta() });
    await user.save();

    house.beans += item.price;
    await house.save();

    res.json({ message: "Item purchased", user });
  } catch (error) {
    next(error);
  }
};

exports.sellItem = async (req, res, next) => {
  try {
    const { userId, itemName } = req.body;
    const item = ITEMS[itemName.toLowerCase()];
    if (!item) return res.status(400).json({ message: "Invalid item" });

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    const itemIndex = user.inventory.findIndex(
      (i) => i.name.toLowerCase() === itemName.toLowerCase()
    );
    if (itemIndex === -1)
      return res.status(400).json({ message: "Item not found in inventory" });

    user.inventory.splice(itemIndex, 1);
    user.beans += Math.floor(item.price / 2);
    await user.save();

    res.json({ message: "Item sold", user });
  } catch (error) {
    next(error);
  }
};

const LOTTERY_CHANCE = 10000; // The slim chance (1 in LOTTERY_CHANCE)
const HOUSE_ID = "67bbdee28094dd05bc218d1d";

exports.runLottery = async (req, res, next) => {
  try {
    const { userId } = req.body;

    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Deduct 1 bean from the user's account
    if (user.beans < 1)
      return res
        .status(400)
        .json({ message: "Not enough beans to participate" });

    user.beans -= 1;
    await user.save();

    // Find the lottery "lucky" winner condition
    const isWinner = Math.random() < 1 / LOTTERY_CHANCE;

    const house = await User.findById(HOUSE_ID);
    if (!house) {
      return res.status(404).json({ message: "Lottery account not found" });
    }

    if (isWinner) {
      // Give all the beans from the winner's account to the user
      const winnerBeans = house.beans;
      user.beans += winnerBeans;

      // Reset the winner's bean count to 0
      house.beans = 0;
      await house.save();

      await user.save();

      res.json({ message: "Congratulations! You won all the beans", user });
    } else {
      // Give the winner 1 bean from the user
      house.beans += 1;
      await house.save();

      res.json({
        message:
          "Better luck next time! Your 1 bean went to the lottery account.",
        user,
      });
    }
  } catch (error) {
    next(error);
  }
};

// Debt Request Controller
exports.requestDebt = async (req, res, next) => {
  try {
    const { userId, amount } = req.body;

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Ensure the user has less than 1,000,000 beans and no items in their inventory
    if (user.beans >= 1000000) {
      return res
        .status(400)
        .json({ message: "User has enough beans to not be eligible for debt" });
    }

    if (user.inventory.length > 0) {
      return res.status(400).json({
        message:
          "User cannot request debt if they have items in their inventory",
      });
    }

    if (amount <= 500000 || amount > 50000000) {
      return res.status(400).json({
        message: "Requested amount must be between 1,000,000 and 50,000,000",
      });
    }

    // Calculate the debt with the 20% fee
    const debtWithFee = Math.floor(amount * 1.2); // Adding 20% fee

    // Add the debt and the requested beans to the user's account
    user.debt += debtWithFee;
    user.beans += amount;

    // Save the updated user data
    await user.save();

    res.json({
      message: `Debt of ${amount} requested successfully. Total debt with 20% fee: ${debtWithFee}`,
      user,
    });
  } catch (error) {
    next(error);
  }
};
