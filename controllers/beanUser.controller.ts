const { User } = require("../models/beans.model.js");
const crypto = require("crypto");
const mongoose = require("mongoose");
const sanitizeUser = require("../utils/sanitizeUser");
const { HOUSE_ID, DUPE_ID } = require("../beansecret.js");

const getKey = (string) => string.slice(-10);

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

    inviter.notifications = inviter.notifications || [];
    inviter.notifications.push({
      text: `Your invite code was used by ${name}`,
    });

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

    user.notifications = [];
    user.notifications.push({
      text: "Welcome to the game! You have been gifted 10,000,000 beans to start betting.",
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

    res.json({
      message: "Login successful",
      user: sanitizeUser(user),
      key: getKey(hashedInputPassword),
    });
  } catch (error) {
    next(error);
  }
};

// Get user details
exports.getUser = async (req, res, next) => {
  try {
    const { id, key } = req.params;

    if (!id) return res.status(400).json({ message: "Missing id" });
    if (!key) return res.status(400).json({ message: "Missing key" });

    const user = await User.findById(id);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check if the key matches the last 10 characters of the stored password
    if (user.password.slice(-10) !== key)
      return res.status(403).json({ message: "Invalid key" });

    res.status(200).json(sanitizeUser(user));
  } catch (error) {
    next(error);
  }
};

exports.getWinners = async (req, res, next) => {
  try {
    const excludedUsers = [
      new mongoose.Types.ObjectId(HOUSE_ID),
      new mongoose.Types.ObjectId(DUPE_ID),
    ];

    const winners = await User.find({
      contentType: "user",
      _id: { $nin: excludedUsers }, // Exclude specific users
    }).select("name beans debt wins -_id");

    // Sort by beans - debt in descending order
    winners.sort((a, b) => b.beans - b.debt - (a.beans - a.debt));

    res.json(winners);
  } catch (error) {
    next(error);
  }
};

// Update user information
//this controller should not exist, really
exports.updateUser = async (req, res, next) => {
  try {
    const { id } = req.params;
    const updateData = { ...req.body };

    delete updateData.password;
    delete updateData.contentType;
    delete updateData._id;
    delete updateData.role;
    delete updateData.beans;
    delete updateData.wins;
    delete updateData.inventory;
    delete updateData.name;
    delete updateData.penalties;

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

exports.updateNotification = async (req, res, next) => {
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

// Debt Request Controller
exports.requestDebt = async (req, res, next) => {
  try {
    const { userId, amount } = req.body;

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Ensure the user has less than 1,000,000 beans and no items in their inventory
    if (user.beans >= 2000000) {
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

    if (amount < 2000000 || amount > 50000000) {
      return res.status(400).json({
        message: "Requested amount must be between 2,000,000 and 50,000,000",
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
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};

// Debt Payment Controller
exports.payOffDebt = async (req, res, next) => {
  try {
    const { userId, amount } = req.body;

    // Find the user by ID
    const user = await User.findById(userId);
    if (!user) return res.status(404).json({ message: "User not found" });

    // Check if the user has any debt
    if (user.debt <= 0) {
      return res.status(400).json({ message: "User has no debt to pay off" });
    }

    // Ensure the user has enough beans to pay off the debt
    if (user.beans < amount) {
      return res
        .status(400)
        .json({ message: "Not enough beans to pay off the debt" });
    }

    // Calculate the amount to pay off, ensuring it doesn't exceed the user's debt
    const payAmount = Math.min(amount, user.debt);

    // Deduct the payment from the user's beans
    user.beans -= payAmount;
    user.debt -= payAmount;

    // Save the updated user data
    await user.save();

    res.json({
      message: `Successfully paid off ${payAmount} of the debt. Remaining debt: ${user.debt}`,
      user: sanitizeUser(user),
    });
  } catch (error) {
    next(error);
  }
};